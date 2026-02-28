import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: "#111",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 28,
                }}
            >
                <span style={{ color: "white", fontSize: 180, fontWeight: 800, letterSpacing: -6 }}>
                    SH
                </span>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 44, fontWeight: 400, letterSpacing: -1 }}>
                    SaintsHelp
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 26 }}>
                    Citation-only search engine for spiritual texts
                </span>
            </div>
        ),
        { ...size }
    );
}
