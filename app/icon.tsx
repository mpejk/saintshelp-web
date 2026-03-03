import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    background: "#111",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    borderRadius: 7,
                    position: "relative",
                }}
            >
                {/* Small 's' */}
                <span style={{
                    color: "white",
                    fontSize: 14,
                    fontWeight: 700,
                    lineHeight: 1,
                    marginBottom: 2,
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}>
                    {/* Halo/ellipsis above the s */}
                    <span style={{
                        width: 10,
                        height: 5,
                        borderRadius: "50%",
                        border: "1.5px solid white",
                        marginBottom: 0,
                    }} />
                    s
                </span>
                {/* Capital H */}
                <span style={{
                    color: "white",
                    fontSize: 22,
                    fontWeight: 800,
                    lineHeight: 1,
                    marginBottom: 2,
                    letterSpacing: -0.5,
                }}>
                    H
                </span>
            </div>
        ),
        { ...size }
    );
}
