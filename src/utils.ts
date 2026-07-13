/**
 * 유틸리티 함수 모듈
 *
 * - calculate_distance: Haversine 공식으로 두 좌표 간 거리 계산
 * - filter_coordinates_by_interval: 경로 좌표에서 일정 간격으로 샘플링
 * - wgs84_to_katec: WGS84 좌표를 KATEC 좌표로 변환
 * - katec_to_wgs84: KATEC 좌표를 WGS84 좌표로 변환
 */

import proj4 from "proj4";

// ---------------------------------------------------------------------------
// KATEC 좌표계 정의 (성능 최적화를 위해 모듈 레벨에서 한 번만 등록)
// ---------------------------------------------------------------------------

const KATEC_DEF =
  "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000 +y_0=600000 " +
  "+ellps=bessel +units=m +no_defs " +
  "+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43";

proj4.defs("KATEC", KATEC_DEF);

const wgs84ToKatecConverter = proj4("EPSG:4326", "KATEC");
const katecToWgs84Converter = proj4("KATEC", "EPSG:4326");

// ---------------------------------------------------------------------------
// Haversine 거리 계산
// ---------------------------------------------------------------------------

/**
 * Haversine 공식으로 두 WGS84 좌표 간 거리를 계산합니다.
 *
 * @param x1 - 첫 번째 지점 경도
 * @param y1 - 첫 번째 지점 위도
 * @param x2 - 두 번째 지점 경도
 * @param y2 - 두 번째 지점 위도
 * @returns 거리 (미터)
 */
export function calculate_distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const R = 6371000; // 지구 반지름 (미터)

  // 라디안 변환
  const lat1 = (y1 * Math.PI) / 180;
  const lat2 = (y2 * Math.PI) / 180;
  const deltaLat = ((y2 - y1) * Math.PI) / 180;
  const deltaLon = ((x2 - x1) * Math.PI) / 180;

  // Haversine 공식
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// ---------------------------------------------------------------------------
// 경로 좌표 샘플링
// ---------------------------------------------------------------------------

/**
 * 경로 좌표 목록에서 100개당 1개씩 샘플링합니다.
 *
 * @param vertexes - [x1, y1, x2, y2, ...] 형식의 좌표 배열
 * @param _intervalMeters - 사용하지 않음 (하위 호환성을 위해 유지)
 * @returns [[x1, y1], [x2, y2], ...] 형식의 필터링된 좌표 목록
 */
export function filter_coordinates_by_interval(
  vertexes: number[],
  _intervalMeters: number = 2000,
): [number, number][] {
  if (!vertexes || vertexes.length < 2) {
    return [];
  }

  // 좌표 쌍으로 변환
  const coords: [number, number][] = [];
  for (let i = 0; i < vertexes.length; i += 2) {
    coords.push([vertexes[i], vertexes[i + 1]]);
  }

  if (coords.length === 0) {
    return [];
  }

  // 100개당 1개씩 샘플링 (첫 번째와 마지막은 항상 포함)
  const filtered: [number, number][] = [coords[0]];

  // 중간 좌표들을 100개 간격으로 샘플링
  for (let i = 100; i < coords.length - 1; i += 100) {
    filtered.push(coords[i]);
  }

  // 마지막 좌표는 항상 포함 (이미 포함되어 있지 않다면)
  const last = coords[coords.length - 1];
  if (coords.length > 1 && (last[0] !== filtered[filtered.length - 1][0] || last[1] !== filtered[filtered.length - 1][1])) {
    filtered.push(last);
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// 좌표계 변환 (WGS84 ↔ KATEC)
// ---------------------------------------------------------------------------

/**
 * WGS84 좌표(경도, 위도)를 KATEC 좌표로 변환합니다.
 *
 * @param lon - 경도 (WGS84)
 * @param lat - 위도 (WGS84)
 * @returns [x, y] KATEC 좌표 (미터 단위)
 */
export function wgs84_to_katec(lon: number, lat: number): [number, number] {
  const result = wgs84ToKatecConverter.forward([lon, lat]);
  return [result[0], result[1]];
}

/**
 * KATEC 좌표를 WGS84 좌표(경도, 위도)로 변환합니다.
 *
 * @param x - KATEC X 좌표 (미터)
 * @param y - KATEC Y 좌표 (미터)
 * @returns [lon, lat] WGS84 좌표
 */
export function katec_to_wgs84(x: number, y: number): [number, number] {
  const result = katecToWgs84Converter.forward([x, y]);
  return [result[0], result[1]];
}
