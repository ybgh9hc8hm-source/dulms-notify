/** Student profile card: identity, photo, GPA and credit-hour summary. */
import { api, apiObj, BASE, Jar, request } from "./http";
import { courseLabel, gradeText, join, num, str, toIso, toIsoLoose } from "./parse";
import type { DulmsProfile, Row } from "./types";

function findPhotoRef(row: Row | null, html?: string): string | null {
  for (const [key, value] of Object.entries(row ?? {})) {
    if (!/photo|image|pic|img|avatar|std_?p/i.test(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length < 8) continue;
    return trimmed;
  }
  // Long base64-looking field on any key
  for (const value of Object.values(row ?? {})) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 400 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed)) return trimmed;
  }
  if (!html) return null;
  const patterns = [
    /src=["']([^"']*(?:StudentPhoto|StudentsPhoto|StudentImage|StudentImg|StdImage|StdPhoto|StudentPic|Students|UploadedFiles|Uploads|Photos?|Images?)[^"']*\.(?:jpg|jpeg|png|gif)[^"']*)["']/i,
    /<img[^>]+(?:id|class|alt|name)=["'][^"']*(?:profile|student|std|user|avatar|photo)[^"']*["'][^>]*src=["']([^"']+)["']/i,
    /src=["']([^"']+)["'][^>]*(?:id|class|alt|name)=["'][^"']*(?:profile|student|std|user|avatar|photo)[^"']*["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** DULMS photos need the student session, so we inline them as a data URL. */
async function photoDataUrl(jar: Jar, raw: string | null): Promise<string | null> {
  if (!raw) return null;
  // DULMS serves unscaled photos (several MB). They are safe to keep because the
  // dashboard no longer reads them with the overview — `getStudentPhoto` fetches
  // them once, lazily, and caches them for an hour.
  const MAX = 8_000_000;
  if (raw.startsWith("data:image/")) return raw.length > MAX ? null : raw;
  if (/^[A-Za-z0-9+/=\s]{300,}$/.test(raw)) {
    const clean = raw.replace(/\s/g, "");
    return clean.length > MAX ? null : `data:image/jpeg;base64,${clean}`;
  }
  // DULMS student photos live on a sibling host (dep.deltauniv.edu.eg) — the
  // main app just prefixes that origin in JS: `dep.deltauniv.edu.eg` + PhotoPath.
  // For any bare /photos/... or /Uploads/... path, try that host first.
  const candidates: string[] = [];
  if (/^https?:\/\//i.test(raw)) {
    candidates.push(raw);
  } else if (raw.startsWith("/")) {
    candidates.push("https://dep.deltauniv.edu.eg" + raw);
    candidates.push(new URL(raw, BASE).toString());
  } else {
    candidates.push(new URL(raw, BASE).toString());
  }
  for (const target of candidates) {
    try {
      const res = await fetch(target, {
        headers: {
          ...jar.clientHeaders(),
          cookie: jar.header(),
          referer: `${BASE}/`,
          accept: "image/*,*/*;q=0.8",
        },
      });
      if (!res.ok) continue;
      let type = res.headers.get("content-type") ?? "image/jpeg";
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX) continue;
      if (!type.startsWith("image/")) {
        // sniff magic bytes
        if (bytes[0] === 0xff && bytes[1] === 0xd8) type = "image/jpeg";
        else if (bytes[0] === 0x89 && bytes[1] === 0x50) type = "image/png";
        else if (bytes[0] === 0x47 && bytes[1] === 0x49) type = "image/gif";
        else continue;
      }
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${type};base64,${btoa(binary)}`;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Try known DULMS endpoints that return the student photo. */
async function tryPhotoEndpoints(jar: Jar, dulmsId: string): Promise<string | null> {
  const candidates = [
    `/Profile/GetStudentPhoto?studentId=${dulmsId}`,
    `/Profile/GetStudentPhoto?id=${dulmsId}`,
    `/Profile/GetStudentPhoto`,
    `/Profile/StudentPhoto?id=${dulmsId}`,
    `/Profile/StudentImage?id=${dulmsId}`,
    `/Profile/GetStudentImage?id=${dulmsId}`,
    `/Home/StudentImage?id=${dulmsId}`,
    `/StudentPortal/GetStudentImage?id=${dulmsId}`,
    `/Uploads/StudentsPhoto/${dulmsId}.jpg`,
    `/UploadedFiles/StudentsPhoto/${dulmsId}.jpg`,
    `/StudentsPhoto/${dulmsId}.jpg`,
  ];
  for (const path of candidates) {
    const result = await photoDataUrl(jar, path);
    if (result) return result;
  }
  return null;
}

export async function readProfile(
  jar: Jar,
  dulmsId: string,
  landingHtml?: string,
  cachedPhoto?: string | null,
): Promise<DulmsProfile | null> {
  const [academic, personal, gpa, groups] = await Promise.all([
    apiObj(jar, "/Profile/GetStudentAcademicData"),
    apiObj(jar, "/Profile/GetStudentData"),
    api<Row>(jar, "/GPAProgress/RepoChart_SGPAProgress", "POST"),
    api<Row>(jar, "/Registered/GetStudentProgramGroups", "GET").catch(() => [] as Row[]),
  ]);
  if (!academic && !personal) return null;

  const latestGpa = gpa.length ? gpa[gpa.length - 1]! : null;
  const passed = num(academic?.["TP_Hours"]);
  const required = num(academic?.["RequiredHours"]);
  // The photo never changes, and hunting for it costs up to ~16 extra requests
  // per pull. Once we have one stored, reuse it instead of asking DULMS again.
  let photo = cachedPhoto ?? null;
  if (!photo) {
    photo = await photoDataUrl(
      jar,
      findPhotoRef(personal, landingHtml) ?? findPhotoRef(academic, landingHtml),
    );
  }
  if (!photo) {
    // fall back to profile pages that might carry an <img> tag
    for (const page of ["/Profile/Index", "/Profile", "/Home/Index", "/Student/Profile"]) {
      try {
        const res = await request(jar, page);
        const ref = findPhotoRef(null, res.html);
        if (ref) {
          photo = await photoDataUrl(jar, ref);
          if (photo) break;
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (!photo) photo = await tryPhotoEndpoints(jar, dulmsId);

  return {
    name:
      str(academic?.["Student_Name"]) ??
      str(personal?.["NameEn"]) ??
      str(personal?.["NameAr"]) ??
      null,
    dulmsId,
    photo,
    faculty: str(academic?.["Faculty"]),
    program: str(academic?.["Program"]),
    guide: str(academic?.["AcademicGuidance"]) ?? str(academic?.["Academic_Guidance"]),
    status: str(academic?.["Student_Status2"]) ?? str(academic?.["Student_Status"]),
    level: str(academic?.["Level"]),
    cgpa: str(academic?.["Genral_Grade"]) ?? str(latestGpa?.["CGPA"]),
    sgpa: str(latestGpa?.["SGPA"]),
    passedHours: passed,
    requiredHours: required,
    remainingHours: required !== null && passed !== null ? Math.max(required - passed, 0) : null,
    registeredCourses: str(academic?.["RegisteredCoursesCount"]),
    gpaHistory: gpa
      .map((row) => ({
        semester: str(row["Year_Semester"]) ?? "",
        sgpa: num(row["SGPA"]),
        cgpa: num(row["CGPA"]),
      }))
      .filter((entry) => entry.semester !== ""),
    planGroups: groups
      .map((row) => ({
        name: str(row["GrpName"]) ?? "",
        totalHours: num(row["TotalHours"]) ?? 0,
        passedHours: num(row["PassedHours"]) ?? 0,
      }))
      .filter((entry) => entry.name !== "" && entry.totalHours > 0),
  };
}
