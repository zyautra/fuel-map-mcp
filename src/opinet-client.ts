/**
 * Opinet API 클라이언트 모듈
 *
 * - get_nearby_gas_stations: 좌표 기반 반경 내 주유소 검색
 */

import { wgs84_to_katec, katec_to_wgs84 } from "./utils.js";

const OPINET_API_KEY: string = (() => {
  const key = process.env["OPINET_API_KEY"];
  if (!key) {
    throw new Error(
      "OPINET_API_KEY environment variable is required. " +
        "Please set it in your platform's environment variables.",
    );
  }
  return key;
})();

const OPINET_BASE = "https://www.opinet.co.kr/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GasStation {
  station_id: string;
  brand: string;
  name: string;
  price: number;
  distance: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// get_nearby_gas_stations
// ---------------------------------------------------------------------------

/**
 * Opinet API로 좌표 기반 반경 내 주유소 목록을 조회합니다.
 *
 * @param x - 경도 (WGS84)
 * @param y - 위도 (WGS84)
 * @param radius - 검색 반경 (미터, 최대 5000)
 * @param fuelType - 유종 코드 (B027: 휘발유, D047: 경유, K015: 등유, C004: LPG)
 * @param sort - 정렬 방법 (1: 가격순, 2: 거리순)
 * @returns 주유소 목록
 */
export async function get_nearby_gas_stations(
  x: number,
  y: number,
  radius: number = 1000,
  fuelType: string = "B027",
  sort: number = 1,
): Promise<GasStation[]> {
  // WGS84 -> KATEC 변환
  const [katecX, katecY] = wgs84_to_katec(x, y);

  const params = new URLSearchParams({
    code: OPINET_API_KEY,
    out: "json",
    x: String(katecX),
    y: String(katecY),
    radius: String(radius),
    prodcd: fuelType,
    sort: String(sort),
  });

  const url = `${OPINET_BASE}/aroundAll.do?${params.toString()}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Opinet API error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    RESULT?: {
      OIL?: {
        UNI_ID?: string;
        POLL_DIV_CD?: string;
        OS_NM?: string;
        PRICE?: string;
        DISTANCE?: string;
        GIS_X_COOR?: string;
        GIS_Y_COOR?: string;
      }[];
    };
  };

  const oilList = data.RESULT?.OIL ?? [];

  if (oilList.length === 0) {
    return [];
  }

  const stations: GasStation[] = [];

  for (const station of oilList) {
    try {
      const priceStr = station.PRICE;
      if (!priceStr || priceStr === "-") {
        continue;
      }

      // KATEC 좌표를 WGS84로 변환
      const stationKatecX = parseFloat(station.GIS_X_COOR ?? "0");
      const stationKatecY = parseFloat(station.GIS_Y_COOR ?? "0");
      const [wgs84X, wgs84Y] = katec_to_wgs84(stationKatecX, stationKatecY);

      stations.push({
        station_id: station.UNI_ID ?? "",
        brand: station.POLL_DIV_CD ?? "",
        name: station.OS_NM ?? "",
        price: parseInt(priceStr, 10),
        distance: parseFloat(station.DISTANCE ?? "0"),
        x: wgs84X,
        y: wgs84Y,
      });
    } catch {
      // 개별 파싱 실패 시 무시
      continue;
    }
  }

  return stations;
}
