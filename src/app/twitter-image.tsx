import { ImageResponse } from "next/og";

export const alt = "WriteMyBook - AI-Powered Novel Writing Platform";
export const size = { width: 1200, height: 600 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 60%, #16213e 100%)",
          padding: "50px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "36px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "#7c3aed",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
            </svg>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.8)",
              letterSpacing: "-0.02em",
            }}
          >
            WriteMyBook
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "52px",
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.2,
            letterSpacing: "-0.03em",
            maxWidth: "900px",
          }}
        >
          A Professional Publishing House In Your Browser
        </div>

        <div
          style={{
            display: "flex",
            fontSize: "22px",
            color: "rgba(255, 255, 255, 0.6)",
            marginTop: "20px",
            textAlign: "center",
            letterSpacing: "-0.01em",
          }}
        >
          14 AI Agents | From Concept to Export-Ready Manuscript
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "36px",
            right: "60px",
            fontSize: "18px",
            color: "rgba(255, 255, 255, 0.4)",
          }}
        >
          writemybook.app
        </div>
      </div>
    ),
    { ...size },
  );
}
