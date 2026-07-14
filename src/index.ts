/**
 * fuel-map-mcp: 출발지-목적지 경로 찾기 및 주유소 검색 MCP 서버
 *
 * 제공 도구:
 *   - get_route: 출발지/목적지 텍스트를 받아 Kakao Mobility로 경로를 반환합니다.
 *   - find_cheapest_gas_stations_nearby: 특정 좌표 근처의 최저가 주유소를 찾습니다.
 *   - find_cheapest_gas_stations_on_route: 경로상의 최저가 주유소를 찾습니다.
 */

import "dotenv/config";

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";

import { address_to_coords, get_directions } from "./kakao-client.js";
import { get_nearby_gas_stations } from "./opinet-client.js";
import { filter_coordinates_by_interval } from "./utils.js";

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer(
  { name: "fuel-map-mcp", version: "0.1.0" },
  { capabilities: { logging: {} } },
);

// ---------------------------------------------------------------------------
// Tool: get_route
// ---------------------------------------------------------------------------

const getRouteAnnotations: ToolAnnotations = {
  title: "Get Route",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

mcpServer.registerTool(
  "get_route",
  {
    description:
      "Retrieves route information between origin and destination using Fuel Station Compass(주유소 나침반).",
    annotations: getRouteAnnotations,
    inputSchema: {
      origin: z.string().describe("Origin address or place name (e.g. 'Gangnam Station')"),
      destination: z.string().describe("Destination address or place name (e.g. 'Pangyo Station')"),
      priority: z
        .enum(["RECOMMEND", "TIME", "DISTANCE"])
        .optional()
        .default("RECOMMEND")
        .describe("Route priority (default: RECOMMEND)"),
    },
  },
  async ({ origin, destination, priority }) => {
    // 1) 주소 → 좌표 변환
    const originCoords = await address_to_coords(origin);
    const destCoords = await address_to_coords(destination);

    // 2) 경로 조회
    const directions = await get_directions(
      originCoords.x,
      originCoords.y,
      destCoords.x,
      destCoords.y,
      priority,
    );

    const fare = directions.fare;

    const result = {
      distance_km: Math.round((directions.distance / 1000) * 10) / 10,
      duration_min: Math.round(directions.duration / 60),
      toll_fare: fare.toll ?? 0,
      taxi_fare: fare.taxi ?? 0,
      origin_coords: originCoords,
      destination_coords: destCoords,
      route_vertexes: directions.route_vertexes,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: find_cheapest_gas_stations_nearby
// ---------------------------------------------------------------------------

const findNearbyAnnotations: ToolAnnotations = {
  title: "Find Cheapest Gas Stations Nearby",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

mcpServer.registerTool(
  "find_cheapest_gas_stations_nearby",
  {
    description:
      "Finds the 5 cheapest gas stations near a specific location using Fuel Station Compass(주유소 나침반).",
    annotations: findNearbyAnnotations,
    inputSchema: {
      location: z.string().describe("Address or place name (e.g. 'Gangnam Station')"),
      fuel_type: z
        .enum(["B027", "D047", "K015", "C004"])
        .optional()
        .default("B027")
        .describe("Fuel type code — B027: Gasoline, D047: Diesel, K015: Kerosene, C004: LPG"),
      radius: z
        .number()
        .int()
        .optional()
        .default(1000)
        .describe("Search radius in meters (max 5000, default: 1000)"),
    },
  },
  async ({ location, fuel_type, radius }) => {
    // 1) 위치 문자열 → 좌표 변환
    const locationCoords = await address_to_coords(location);

    // 2) 주유소 검색
    const stations = await get_nearby_gas_stations(
      locationCoords.x,
      locationCoords.y,
      Math.min(radius, 5000),
      fuel_type,
      1,
    );

    // 3) 가격 기준 정렬
    stations.sort((a, b) => a.price - b.price);

    // 4) 최저가 5곳 선택
    const cheapestStations = stations.slice(0, 5).map((station) => ({
      name: station.name,
      brand: station.brand,
      price: station.price,
      distance: station.distance,
      x: station.x,
      y: station.y,
    }));

    const result = {
      location: locationCoords,
      gas_stations: cheapestStations,
      total_found: stations.length,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: find_cheapest_gas_stations_on_route
// ---------------------------------------------------------------------------

const findOnRouteAnnotations: ToolAnnotations = {
  title: "Find Cheapest Gas Stations on Route",
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

mcpServer.registerTool(
  "find_cheapest_gas_stations_on_route",
  {
    description:
      "Finds the 5 cheapest gas stations along a route using Fuel Station Compass(주유소 나침반).",
    annotations: findOnRouteAnnotations,
    inputSchema: {
      origin: z.string().describe("Origin address or place name (e.g. 'Gangnam Station')"),
      destination: z.string().describe("Destination address or place name (e.g. 'Pangyo Station')"),
      fuel_type: z
        .enum(["B027", "D047", "K015", "C004"])
        .optional()
        .default("B027")
        .describe("Fuel type code — B027: Gasoline, D047: Diesel, K015: Kerosene, C004: LPG"),
      priority: z
        .enum(["RECOMMEND", "TIME", "DISTANCE"])
        .optional()
        .default("RECOMMEND")
        .describe("Route priority (default: RECOMMEND)"),
    },
  },
  async ({ origin, destination, fuel_type, priority }) => {
    // 1) 경로 조회
    const originCoords = await address_to_coords(origin);
    const destCoords = await address_to_coords(destination);
    const directions = await get_directions(
      originCoords.x,
      originCoords.y,
      destCoords.x,
      destCoords.y,
      priority,
    );

    // 2) 경로 좌표를 2km 간격으로 샘플링
    const sampledCoords = filter_coordinates_by_interval(
      directions.route_vertexes,
      2000,
    );

    // 3) 각 샘플링된 좌표에서 1km 반경 내 주유소 검색
    const allStations: {
      name: string;
      brand: string;
      price: number;
      distance_from_route_point: number;
      x: number;
      y: number;
    }[] = [];
    const stationIds = new Set<string>();

    for (const [x, y] of sampledCoords) {
      try {
        const stations = await get_nearby_gas_stations(x, y, 1000, fuel_type, 1);

        for (const station of stations) {
          if (!stationIds.has(station.station_id)) {
            stationIds.add(station.station_id);
            allStations.push({
              name: station.name,
              brand: station.brand,
              price: station.price,
              distance_from_route_point: station.distance,
              x: station.x,
              y: station.y,
            });
          }
        }
      } catch {
        // 개별 지점 검색 실패 시 무시하고 계속 진행
        continue;
      }
    }

    // 4) 가격 기준으로 정렬하여 최저가 5곳 선택
    allStations.sort((a, b) => a.price - b.price);
    const cheapestStations = allStations.slice(0, 5);

    const distanceKm = Math.round((directions.distance / 1000) * 10) / 10;
    const durationMin = Math.round(directions.duration / 60);

    const result = {
      route_info: {
        distance_km: distanceKm,
        duration_min: durationMin,
        origin: originCoords,
        destination: destCoords,
      },
      gas_stations: cheapestStations,
      sampled_points_count: sampledCoords.length,
      total_stations_found: allStations.length,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// HTTP Server (Express + StreamableHTTP + /health)
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "fuel-map-mcp", version: "0.1.0" });
});

// MCP Streamable HTTP endpoint (stateless)
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("close", () => {
    transport.close();
  });
});

// Start server
const port = parseInt(process.env["MCP_PORT"] ?? "8000", 10);
const host = process.env["MCP_HOST"] ?? "0.0.0.0";

app.listen(port, host, () => {
  console.log(`fuel-map-mcp running on http://${host}:${port}`);
  console.log(`  Health check: http://${host}:${port}/health`);
  console.log(`  MCP endpoint: POST http://${host}:${port}/mcp`);
});

export { app, mcpServer };
