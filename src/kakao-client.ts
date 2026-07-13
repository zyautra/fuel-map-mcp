/**
 * Kakao API 클라이언트 모듈
 *
 * - address_to_coords: 주소/장소명 → (x, y) 좌표 변환
 * - get_directions: Kakao Mobility Directions API로 경로 조회
 */

const KAKAO_REST_API_KEY = process.env["KAKAO_REST_API_KEY"];
if (!KAKAO_REST_API_KEY) {
  throw new Error(
    "KAKAO_REST_API_KEY environment variable is required. " +
      "Please set it in your platform's environment variables.",
  );
}

const LOCAL_BASE = "https://dapi.kakao.com/v2/local";
const NAVI_BASE = "https://apis-navi.kakaomobility.com/v1";

const HEADERS_LOCAL = {
  Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
};

const HEADERS_NAVI = {
  Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoordsResult {
  x: number;
  y: number;
  name: string;
}

export interface DirectionsResult {
  distance: number;
  duration: number;
  fare: { taxi: number; toll: number };
  route_vertexes: number[];
}

// ---------------------------------------------------------------------------
// address_to_coords
// ---------------------------------------------------------------------------

/**
 * 주소 또는 장소명 문자열을 Kakao Local API로 좌표(x, y)로 변환합니다.
 *
 * 먼저 주소 검색을 시도하고, 결과가 없으면 키워드 검색으로 폴백합니다.
 *
 * @returns { x: number, y: number, name: string }
 * @throws Error - 좌표를 찾을 수 없는 경우
 */
export async function address_to_coords(query: string): Promise<CoordsResult> {
  // 1) 주소 검색
  const addrUrl = `${LOCAL_BASE}/search/address.json?query=${encodeURIComponent(query)}`;
  const addrResp = await fetch(addrUrl, { headers: HEADERS_LOCAL });

  if (!addrResp.ok) {
    throw new Error(`Kakao Local API error: ${addrResp.status} ${addrResp.statusText}`);
  }

  const addrData = (await addrResp.json()) as {
    documents?: { x: string; y: string; address_name?: string }[];
  };
  const addrDocs = addrData.documents ?? [];

  if (addrDocs.length > 0) {
    const doc = addrDocs[0]!;
    return {
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      name: doc.address_name ?? query,
    };
  }

  // 2) 키워드(장소명) 검색으로 폴백
  const kwUrl = `${LOCAL_BASE}/search/keyword.json?query=${encodeURIComponent(query)}`;
  const kwResp = await fetch(kwUrl, { headers: HEADERS_LOCAL });

  if (!kwResp.ok) {
    throw new Error(`Kakao Local API error: ${kwResp.status} ${kwResp.statusText}`);
  }

  const kwData = (await kwResp.json()) as {
    documents?: { x: string; y: string; place_name?: string }[];
  };
  const kwDocs = kwData.documents ?? [];

  if (kwDocs.length > 0) {
    const doc = kwDocs[0]!;
    return {
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      name: doc.place_name ?? query,
    };
  }

  throw new Error(`좌표를 찾을 수 없습니다: '${query}'`);
}

// ---------------------------------------------------------------------------
// get_directions
// ---------------------------------------------------------------------------

/**
 * Kakao Mobility Directions API로 경로를 조회합니다.
 *
 * @param originX - 출발지 경도 (WGS84)
 * @param originY - 출발지 위도 (WGS84)
 * @param destinationX - 목적지 경도 (WGS84)
 * @param destinationY - 목적지 위도 (WGS84)
 * @param priority - RECOMMEND | TIME | DISTANCE (기본: RECOMMEND)
 * @returns 경로 정보
 * @throws Error - 경로를 찾을 수 없는 경우
 */
export async function get_directions(
  originX: number,
  originY: number,
  destinationX: number,
  destinationY: number,
  priority: string = "RECOMMEND",
): Promise<DirectionsResult> {
  const params = new URLSearchParams({
    origin: `${originX},${originY}`,
    destination: `${destinationX},${destinationY}`,
    priority,
    summary: "false",
  });

  const url = `${NAVI_BASE}/directions?${params.toString()}`;
  const resp = await fetch(url, { headers: HEADERS_NAVI });

  if (!resp.ok) {
    throw new Error(`Kakao Mobility API error: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as {
    routes?: {
      result_code: number;
      result_msg?: string;
      summary?: {
        distance: number;
        duration: number;
        fare?: { taxi: number; toll: number };
      };
      sections?: {
        roads?: { vertexes?: number[] }[];
      }[];
    }[];
  };

  const routes = data.routes ?? [];

  if (routes.length === 0) {
    throw new Error("경로 데이터가 없습니다.");
  }

  const route = routes[0]!;
  const resultCode = route.result_code;
  if (resultCode !== 0) {
    throw new Error(
      `경로 찾기 실패 (result_code=${resultCode}): ${route.result_msg ?? ""}`,
    );
  }

  const summary = route.summary!;

  // sections 내 모든 roads의 vertexes를 합쳐서 반환
  const vertexes: number[] = [];
  for (const section of route.sections ?? []) {
    for (const road of section.roads ?? []) {
      if (road.vertexes) {
        vertexes.push(...road.vertexes);
      }
    }
  }

  return {
    distance: summary.distance,
    duration: summary.duration,
    fare: summary.fare ?? { taxi: 0, toll: 0 },
    route_vertexes: vertexes,
  };
}
