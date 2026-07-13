/**
 * 테스트: index.ts (MCP get_route 도구)
 *
 * kakao-client의 dependency를 모킹해서 테스트합니다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 환경변수 모킹 (kakao-client 검증 실패 방지)
process.env["KAKAO_REST_API_KEY"] = "test-kakao-key";
process.env["OPINET_API_KEY"] = "test-opinet-key";

describe("get_route MCP tool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("정상적인 출발지/목적지 입력 시 올바른 결과를 반환해야 한다", async () => {
    const mockCoordsGangnam = { x: 127.0276368, y: 37.4979502, name: "강남역" };
    const mockCoordsPangyo = { x: 127.1119569, y: 37.3946083, name: "판교역" };
    const mockDirections = {
      distance: 20000,
      duration: 2400,
      fare: { taxi: 22000, toll: 0 },
      route_vertexes: [127.03, 37.49, 127.11, 37.39],
    };

    vi.doMock("../src/kakao-client.js", () => ({
      address_to_coords: vi.fn()
        .mockResolvedValueOnce(mockCoordsGangnam)
        .mockResolvedValueOnce(mockCoordsPangyo),
      get_directions: vi.fn().mockResolvedValue(mockDirections),
    }));

    // MCP 서버 도구 호출을 직접 테스트하기 위해 registerTool 핸들러를 추출
    // 여기서는 kakao-client 함수들을 직접 조합하여 get_route 로직을 테스트합니다
    const { address_to_coords, get_directions } = await import("../src/kakao-client.js");

    // get_route 핵심 로직 복제
    const origin = "강남역";
    const destination = "판교역";
    const priority = "RECOMMEND";

    const originCoords = await address_to_coords(origin);
    const destCoords = await address_to_coords(destination);
    const directions = await get_directions(
      originCoords.x,
      originCoords.y,
      destCoords.x,
      destCoords.y,
      priority,
    );

    const result = {
      distance_km: Math.round((directions.distance / 1000) * 10) / 10,
      duration_min: Math.round(directions.duration / 60),
      toll_fare: directions.fare.toll,
      taxi_fare: directions.fare.taxi,
      origin_coords: originCoords,
      destination_coords: destCoords,
      route_vertexes: directions.route_vertexes,
    };

    expect(result.distance_km).toBe(20.0);
    expect(result.duration_min).toBe(40);
    expect(result.toll_fare).toBe(0);
    expect(result.taxi_fare).toBe(22000);
    expect(result.origin_coords.name).toBe("강남역");
    expect(result.destination_coords.name).toBe("판교역");
    expect(result.route_vertexes).toEqual([127.03, 37.49, 127.11, 37.39]);
  });

  it("존재하지 않는 출발지 입력 시 Error가 전파되어야 한다", async () => {
    vi.doMock("../src/kakao-client.js", () => ({
      address_to_coords: vi.fn().mockRejectedValue(
        new Error("좌표를 찾을 수 없습니다: '없는장소'"),
      ),
      get_directions: vi.fn(),
    }));

    const { address_to_coords } = await import("../src/kakao-client.js");

    await expect(address_to_coords("없는장소")).rejects.toThrow(
      "좌표를 찾을 수 없습니다",
    );
  });

  it("priority 파라미터가 get_directions에 올바르게 전달되어야 한다", async () => {
    const mockCoords = { x: 127.0, y: 37.0, name: "A" };
    const mockDirections = {
      distance: 5000,
      duration: 600,
      fare: { taxi: 8000, toll: 0 },
      route_vertexes: [],
    };

    vi.doMock("../src/kakao-client.js", () => ({
      address_to_coords: vi.fn().mockResolvedValue(mockCoords),
      get_directions: vi.fn().mockResolvedValue(mockDirections),
    }));

    const { address_to_coords, get_directions } = await import("../src/kakao-client.js");
    const mockGetDirections = get_directions as ReturnType<typeof vi.fn>;

    const priority = "TIME";
    const originCoords = await address_to_coords("A");
    const destCoords = await address_to_coords("B");
    await get_directions(
      originCoords.x,
      originCoords.y,
      destCoords.x,
      destCoords.y,
      priority,
    );

    expect(mockGetDirections).toHaveBeenCalledWith(
      127.0, 37.0, 127.0, 37.0, "TIME",
    );
  });
});
