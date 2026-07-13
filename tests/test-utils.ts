/**
 * 테스트: utils.ts (Haversine 거리, 좌표 필터링, WGS84↔KATEC 변환)
 */

import { describe, it, expect } from "vitest";
import {
  calculate_distance,
  filter_coordinates_by_interval,
  wgs84_to_katec,
  katec_to_wgs84,
} from "../src/utils.js";

// ---------------------------------------------------------------------------
// calculate_distance
// ---------------------------------------------------------------------------

describe("calculate_distance", () => {
  it("같은 좌표 간 거리는 0이어야 한다", () => {
    const dist = calculate_distance(127.0, 37.5, 127.0, 37.5);
    expect(dist).toBe(0);
  });

  it("서울시청 → 부산시청 약 325km (오차 ±10% 허용)", () => {
    // 서울시청: 126.9780, 37.5665
    // 부산시청: 129.0756, 35.1796
    const dist = calculate_distance(126.978, 37.5665, 129.0756, 35.1796);
    // 실제 약 325,000m
    expect(dist).toBeGreaterThan(290_000);
    expect(dist).toBeLessThan(360_000);
  });

  it("서울시청 → 강남역 약 8km", () => {
    // 서울시청: 126.9780, 37.5665
    // 강남역: 127.0276, 37.4979
    const dist = calculate_distance(126.978, 37.5665, 127.0276, 37.4979);
    expect(dist).toBeGreaterThan(7_000);
    expect(dist).toBeLessThan(10_000);
  });

  it("대칭성: A→B와 B→A는 동일한 거리여야 한다", () => {
    const dist1 = calculate_distance(127.0, 37.0, 128.0, 38.0);
    const dist2 = calculate_distance(128.0, 38.0, 127.0, 37.0);
    expect(dist1).toBeCloseTo(dist2, 5);
  });
});

// ---------------------------------------------------------------------------
// filter_coordinates_by_interval
// ---------------------------------------------------------------------------

describe("filter_coordinates_by_interval", () => {
  it("빈 배열이면 빈 배열을 반환해야 한다", () => {
    const result = filter_coordinates_by_interval([]);
    expect(result).toEqual([]);
  });

  it("좌표가 2개 미만이면 빈 배열을 반환해야 한다", () => {
    const result = filter_coordinates_by_interval([127.0]);
    expect(result).toEqual([]);
  });

  it("좌표가 2개(한 쌍)만 있으면 그 좌표를 반환해야 한다", () => {
    const result = filter_coordinates_by_interval([127.0, 37.5]);
    expect(result).toEqual([[127.0, 37.5]]);
  });

  it("100개 미만의 좌표 쌍에서는 첫 번째와 마지막만 반환해야 한다", () => {
    // 10쌍 = 20개 요소
    const vertexes: number[] = [];
    for (let i = 0; i < 10; i++) {
      vertexes.push(127.0 + i * 0.01, 37.5 + i * 0.01);
    }
    const result = filter_coordinates_by_interval(vertexes);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual([127.0, 37.5]);
    expect(result[result.length - 1]).toEqual([127.09, 37.59]);
  });

  it("201개 좌표 쌍에서는 첫 번째, 101번째, 마지막이 반환되어야 한다", () => {
    // 201쌍 = 402개 요소
    const vertexes: number[] = [];
    for (let i = 0; i < 201; i++) {
      vertexes.push(127.0 + i * 0.001, 37.5 + i * 0.001);
    }
    const result = filter_coordinates_by_interval(vertexes);
    // 첫 번째(0), 100번째 인덱스, 마지막(200) = 3개
    expect(result.length).toBe(3);
    expect(result[0]).toEqual([127.0, 37.5]);
    expect(result[result.length - 1]).toEqual([127.2, 37.7]);
  });
});

// ---------------------------------------------------------------------------
// wgs84_to_katec / katec_to_wgs84
// ---------------------------------------------------------------------------

describe("좌표계 변환 (WGS84 ↔ KATEC)", () => {
  it("wgs84_to_katec: 유효한 좌표를 변환하면 숫자 배열이 반환되어야 한다", () => {
    const result = wgs84_to_katec(127.0, 37.0);
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
    expect(Number.isFinite(result[0])).toBe(true);
    expect(Number.isFinite(result[1])).toBe(true);
  });

  it("katec_to_wgs84: 유효한 KATEC 좌표를 변환하면 WGS84 좌표가 반환되어야 한다", () => {
    const result = katec_to_wgs84(400000, 600000);
    expect(result).toHaveLength(2);
    expect(typeof result[0]).toBe("number");
    expect(typeof result[1]).toBe("number");
    expect(Number.isFinite(result[0])).toBe(true);
    expect(Number.isFinite(result[1])).toBe(true);
  });

  it("왕복 변환 (WGS84 → KATEC → WGS84) 시 원래 좌표와 거의 일치해야 한다", () => {
    const originalLon = 127.0276;
    const originalLat = 37.4979;
    const [katecX, katecY] = wgs84_to_katec(originalLon, originalLat);
    const [wgs84Lon, wgs84Lat] = katec_to_wgs84(katecX, katecY);
    // 오차 0.0001도 이내 (약 10m)
    expect(wgs84Lon).toBeCloseTo(originalLon, 4);
    expect(wgs84Lat).toBeCloseTo(originalLat, 4);
  });
});
