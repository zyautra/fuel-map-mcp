/**
 * 테스트: kakao-client.ts
 *
 * Kakao API를 모킹한 단위 테스트입니다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// 환경변수 모킹을 먼저 설정
vi.mock("dotenv/config", () => ({}));

// 테스트용 KAKAO_REST_API_KEY 설정
process.env["KAKAO_REST_API_KEY"] = "test-kakao-key";

// ---------------------------------------------------------------------------
// address_to_coords
// ---------------------------------------------------------------------------

describe("address_to_coords", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("주소 검색이 성공하면 첫 번째 결과의 좌표를 반환해야 한다", async () => {
    // fetch 모킹
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            { x: "127.1119569", y: "37.3946083", address_name: "경기도 성남시 분당구 판교역로 160" },
          ],
        }),
      })
    );

    const { address_to_coords } = await import("../src/kakao-client.js");
    const result = await address_to_coords("판교역");

    expect(result.x).toBeCloseTo(127.1119569);
    expect(result.y).toBeCloseTo(37.3946083);
  });

  it("주소 검색 결과가 없으면 키워드 검색으로 폴백해야 한다", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            { x: "127.0276368", y: "37.4979502", place_name: "강남역" },
          ],
        }),
      })
    );

    const { address_to_coords } = await import("../src/kakao-client.js");
    const result = await address_to_coords("강남역");

    expect(result.x).toBeCloseTo(127.0276368);
    expect(result.name).toBe("강남역");
  });

  it("주소/키워드 모두 결과 없으면 Error를 throw 해야 한다", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ documents: [] }),
      })
    );

    const { address_to_coords } = await import("../src/kakao-client.js");

    await expect(address_to_coords("존재하지않는장소XYZ")).rejects.toThrow(
      "좌표를 찾을 수 없습니다",
    );
  });
});

// ---------------------------------------------------------------------------
// get_directions
// ---------------------------------------------------------------------------

describe("get_directions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("정상 응답 시 거리/시간/요금/vertexes를 반환해야 한다", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [{
            result_code: 0,
            result_msg: "길찾기 성공",
            summary: {
              distance: 12500,
              duration: 1800,
              fare: { taxi: 15000, toll: 900 },
            },
            sections: [{
              roads: [
                { name: "테헤란로", vertexes: [127.03, 37.49, 127.04, 37.50] },
                { name: "판교로", vertexes: [127.04, 37.50, 127.11, 37.39] },
              ],
            }],
          }],
        }),
      })
    );

    const { get_directions } = await import("../src/kakao-client.js");
    const result = await get_directions(127.0276, 37.4979, 127.1119, 37.3946);

    expect(result.distance).toBe(12500);
    expect(result.duration).toBe(1800);
    expect(result.fare.toll).toBe(900);
    expect(result.route_vertexes).toEqual([
      127.03, 37.49, 127.04, 37.50, 127.04, 37.50, 127.11, 37.39,
    ]);
  });

  it("경로가 없으면 Error를 throw 해야 한다", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ routes: [] }),
      })
    );

    const { get_directions } = await import("../src/kakao-client.js");

    await expect(
      get_directions(0.0, 0.0, 0.0, 0.0),
    ).rejects.toThrow("경로 데이터가 없습니다");
  });

  it("result_code != 0이면 Error를 throw 해야 한다", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: [{
            result_code: 104,
            result_msg: "출발, 도착지가 설정되지 않았습니다.",
          }],
        }),
      })
    );

    const { get_directions } = await import("../src/kakao-client.js");

    await expect(
      get_directions(0.0, 0.0, 0.0, 0.0),
    ).rejects.toThrow("경로 찾기 실패");
  });
});
