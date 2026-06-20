/**
 * fileGenerators.ts — v0.3.0
 * Generates real functional files for AURUM and Rubik repos.
 * Patterns based on: Costa Invest, Embassy Levante, Sandhouse, Casas y Mar.
 */

import { sanitizeSlug } from "./security.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedFile {
  repo: "aurum" | "rubik";
  path: string;
  content: string;
  encoding: "utf8";
  purpose: string;
}

export interface GeneratorResult {
  ok: boolean;
  files: GeneratedFile[];
  assetMode: "client_real_asset" | "fallback_internal_library" | "mixed";
  warnings: string[];
  errors: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toComponentName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toCamelCase(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  return parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function resolveAssetMode(
  hasRealLogo: boolean,
  hasRealHero: boolean,
  hasRealImages: boolean,
): "client_real_asset" | "fallback_internal_library" | "mixed" {
  const realCount = [hasRealLogo, hasRealHero, hasRealImages].filter(Boolean).length;
  if (realCount === 3) return "client_real_asset";
  if (realCount === 0) return "fallback_internal_library";
  return "mixed";
}

function pickFirstImageUrl(mediaAssets: Record<string, unknown>, legacyAssets: Record<string, unknown>): string | null {
  const ma = mediaAssets as Record<string, unknown>;
  const hero = ma?.heroImage as Record<string, unknown> | undefined;
  if (hero?.url && typeof hero.url === "string") return hero.url;
  const props = ma?.propertyImages as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(props) && props.length > 0 && typeof props[0]?.url === "string") return props[0].url as string;
  const la = legacyAssets as Record<string, unknown>;
  const imgs = la?.images as string[] | undefined;
  if (Array.isArray(imgs) && imgs.length > 0) return imgs[0];
  return null;
}

function pickLogoUrl(mediaAssets: Record<string, unknown>, legacyAssets: Record<string, unknown>): string | null {
  const ma = mediaAssets as Record<string, unknown>;
  const logo = ma?.logo as Record<string, unknown> | undefined;
  if (logo?.url && typeof logo.url === "string") return logo.url;
  const la = legacyAssets as Record<string, unknown>;
  if (la?.logo && typeof la.logo === "string") return la.logo as string;
  return null;
}

function pickBrandColors(mediaAssets: Record<string, unknown>): string[] {
  const ma = mediaAssets as Record<string, unknown>;
  const colors = ma?.brandColors as string[] | undefined;
  if (Array.isArray(colors) && colors.length > 0) return colors.slice(0, 3);
  return ["#1a1a2e", "#d4af37", "#ffffff"];
}

function pickPropertyImages(mediaAssets: Record<string, unknown>, legacyAssets: Record<string, unknown>): string[] {
  const ma = mediaAssets as Record<string, unknown>;
  const props = ma?.propertyImages as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(props) && props.length > 0) {
    return props.slice(0, 6).map((p) => p.url as string).filter(Boolean);
  }
  const la = legacyAssets as Record<string, unknown>;
  const imgs = la?.images as string[] | undefined;
  if (Array.isArray(imgs)) return imgs.slice(0, 6);
  return [];
}

function pickVideoUrl(mediaAssets: Record<string, unknown>, legacyAssets: Record<string, unknown>): string {
  const ma = mediaAssets as Record<string, unknown>;
  const videos = ma?.videos as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(videos)) {
    const own = videos.find((v) => v.source !== "aurum_default" && v.source !== "placeholder" && v.url);
    if (own?.url && typeof own.url === "string") return own.url;
  }
  const la = legacyAssets as Record<string, unknown>;
  if (la?.video && typeof la.video === "string") return la.video as string;
  return "/VIDEO_AURUM_HEROWEB.mp4";
}

// ─── AURUM Generator ──────────────────────────────────────────────────────────

/**
 * Generates functional AURUM files for a new lead.
 * Patterns: Costa Invest, Embassy Levante, Sandhouse.
 */
export function buildAurumFiles(payload: Record<string, unknown>): GeneratorResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const files: GeneratedFile[] = [];

  const lead = (payload.lead || {}) as Record<string, unknown>;
  const slug = sanitizeSlug(String(lead.slug || ""));
  const name = String(lead.name || slug);
  const website = String(lead.website || "");
  const sector = String(lead.sector || "Inmobiliaria");
  const zone = String(lead.zone || "");
  const email = typeof lead.email === "string" && lead.email ? lead.email : null;
  const phone = typeof lead.phone === "string" && lead.phone ? lead.phone : null;

  const mediaAssets = (payload.mediaAssets || {}) as Record<string, unknown>;
  const legacyAssets = (payload.assets || {}) as Record<string, unknown>;

  const logoUrl = pickLogoUrl(mediaAssets, legacyAssets);
  const heroImageUrl = pickFirstImageUrl(mediaAssets, legacyAssets);
  const propertyImages = pickPropertyImages(mediaAssets, legacyAssets);
  const videoUrl = pickVideoUrl(mediaAssets, legacyAssets);
  const brandColors = pickBrandColors(mediaAssets);

  const hasRealLogo = Boolean(logoUrl);
  const hasRealHero = Boolean(heroImageUrl);
  const hasRealImages = propertyImages.length > 0;

  if (!hasRealLogo) warnings.push("aurum: logo missing — using fallback placeholder");
  if (!hasRealHero) warnings.push("aurum: heroImage missing — using fallback placeholder");
  if (!hasRealImages) warnings.push("aurum: propertyImages missing — gallery will be empty");
  if (videoUrl === "/VIDEO_AURUM_HEROWEB.mp4") warnings.push("aurum: using VIDEO_AURUM_HEROWEB.mp4 fallback video");
  if (!email) warnings.push("aurum: email not provided — contact section will omit email");
  if (!phone) warnings.push("aurum: phone not provided — contact section will omit phone");

  const assetMode = resolveAssetMode(hasRealLogo, hasRealHero, hasRealImages);
  const componentName = toComponentName(slug);
  const camelSlug = toCamelCase(slug);

  const primaryColor = brandColors[0] || "#1a1a2e";
  const accentColor = brandColors[1] || "#d4af37";

  const fallbackLogo = `https://via.placeholder.com/200x60/1a1a2e/d4af37?text=${encodeURIComponent(name)}`;
  const fallbackHero = `https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1920&q=80`;
  const fallbackGallery = [
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
  ];

  const resolvedLogo = logoUrl || fallbackLogo;
  const resolvedHero = heroImageUrl || fallbackHero;
  const resolvedImages = propertyImages.length > 0 ? propertyImages : fallbackGallery;

  // ── 1. Data file ────────────────────────────────────────────────────────────
  const dataFileContent = `// Auto-generated by immersphere-production-orchestrator v0.3.0
// Lead: ${name} | Slug: ${slug}
// DO NOT EDIT — regenerate via operator pipeline

export interface ${componentName}Data {
  id: string;
  name: string;
  slug: string;
  sector: string;
  zone: string;
  website: string;
  email: string | null;
  phone: string | null;
  diagnosis: string;
  assets: {
    logo: string;
    heroImage: string;
    propertyImages: string[];
    heroVideo: string;
    brandColors: string[];
  };
}

export const ${camelSlug}Data: ${componentName}Data = {
  id: "${slug}",
  name: "${name}",
  slug: "${slug}",
  sector: "${sector}",
  zone: "${zone}",
  website: "${website}",
  email: ${email ? `"${email}"` : "null"},
  phone: ${phone ? `"${phone}"` : "null"},
  diagnosis: "Presencia digital mejorable. Oportunidad de experiencia inmersiva premium.",
  assets: {
    logo: "${resolvedLogo}",
    heroImage: "${resolvedHero}",
    propertyImages: ${JSON.stringify(resolvedImages, null, 4)},
    heroVideo: "${videoUrl}",
    brandColors: ${JSON.stringify(brandColors)},
  },
};
`;

  files.push({
    repo: "aurum",
    path: `src/data/clientDemos/${camelSlug}.ts`,
    content: dataFileContent,
    encoding: "utf8",
    purpose: "Data file con estructura real del cliente",
  });

  // ── 2. Landing component ────────────────────────────────────────────────────
  const landingContent = `// Auto-generated by immersphere-production-orchestrator v0.3.0
// Lead: ${name} | Slug: ${slug}
// Pattern: aurum-landing (Costa Invest, Embassy Levante)

import React from "react";
import { ${camelSlug}Data } from "../data/clientDemos/${camelSlug}";

const data = ${camelSlug}Data;

export default function ${componentName}Landing() {
  return (
    <main
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        background: "#0a0a0a",
        color: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      {/* Hero Section */}
      <section
        style={{
          position: "relative",
          height: "100vh",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={data.assets.heroImage}
          alt={data.name}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            textAlign: "center",
            padding: "0 24px",
            maxWidth: "800px",
          }}
        >
          <img
            src={data.assets.logo}
            alt={data.name + " logo"}
            style={{ height: "60px", marginBottom: "32px", objectFit: "contain" }}
          />
          <h1
            style={{
              fontSize: "clamp(2rem, 5vw, 4rem)",
              fontWeight: 300,
              letterSpacing: "0.05em",
              marginBottom: "16px",
              color: "#ffffff",
            }}
          >
            {data.name}
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "${accentColor}",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              marginBottom: "40px",
            }}
          >
            {data.sector} · {data.zone}
          </p>
          <a
            href={"#contacto"}
            style={{
              display: "inline-block",
              padding: "14px 40px",
              background: "${accentColor}",
              color: "${primaryColor}",
              textDecoration: "none",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontSize: "0.875rem",
            }}
          >
            Solicitar información
          </a>
        </div>
      </section>

      {/* Diagnosis Section */}
      <section
        style={{
          padding: "80px 24px",
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
            fontWeight: 300,
            marginBottom: "24px",
            color: "${accentColor}",
          }}
        >
          Experiencia Premium
        </h2>
        <p style={{ fontSize: "1.125rem", lineHeight: 1.8, color: "#cccccc" }}>
          {data.diagnosis}
        </p>
      </section>

      {/* Gallery Section */}
      {data.assets.propertyImages.length > 0 && (
        <section style={{ padding: "40px 24px 80px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "16px",
              maxWidth: "1200px",
              margin: "0 auto",
            }}
          >
            {data.assets.propertyImages.slice(0, 6).map((src, i) => (
              <img
                key={i}
                src={src}
                alt={data.name + " " + (i + 1)}
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section
        id="contacto"
        style={{
          padding: "80px 24px",
          background: "${primaryColor}",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            fontWeight: 300,
            marginBottom: "32px",
            color: "${accentColor}",
          }}
        >
          Contacto
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
          {data.website && (
            <a
              href={data.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#ffffff", textDecoration: "none", fontSize: "1rem" }}
            >
              {data.website}
            </a>
          )}
          {data.email && (
            <a
              href={"mailto:" + data.email}
              style={{ color: "${accentColor}", textDecoration: "none", fontSize: "1rem" }}
            >
              {data.email}
            </a>
          )}
          {data.phone && (
            <a
              href={"tel:" + data.phone}
              style={{ color: "#ffffff", textDecoration: "none", fontSize: "1rem" }}
            >
              {data.phone}
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
`;

  files.push({
    repo: "aurum",
    path: `src/components/clientDemos/${componentName}Landing.tsx`,
    content: landingContent,
    encoding: "utf8",
    purpose: "Componente Landing funcional",
  });

  // ── 3. Web Completa component ───────────────────────────────────────────────
  const webCompletaContent = `// Auto-generated by immersphere-production-orchestrator v0.3.0
// Lead: ${name} | Slug: ${slug}
// Pattern: aurum-web-completa-blueprint (Embassy Levante, Sandhouse)

import React, { useEffect, useRef } from "react";
import { ${camelSlug}Data } from "../data/clientDemos/${camelSlug}";

const data = ${camelSlug}Data;

// Visual Experience embed URL (Rubik internal engine)
const VISUAL_EXPERIENCE_URL =
  "https://rubik-sota-director-de-orquesta.vercel.app/gesture-lab/${slug}-v1.html";

export default function ${componentName}WebCompleta() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // GSAP + SplitType hero animation (requires GSAP loaded globally)
    if (typeof window !== "undefined" && (window as Record<string, unknown>).gsap) {
      const gsap = (window as Record<string, unknown>).gsap as {
        from: (el: unknown, opts: unknown) => void;
        to: (el: unknown, opts: unknown) => void;
      };
      if (heroRef.current) {
        gsap.from(heroRef.current.querySelector("h1"), {
          opacity: 0,
          y: 60,
          duration: 1.2,
          ease: "power3.out",
        });
        gsap.from(heroRef.current.querySelector("p"), {
          opacity: 0,
          y: 40,
          duration: 1,
          delay: 0.3,
          ease: "power3.out",
        });
      }
    }
  }, []);

  return (
    <main
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        background: "#0a0a0a",
        color: "#f5f5f5",
        minHeight: "100vh",
      }}
    >
      {/* Section 1: Hero Video Motion */}
      <section
        ref={heroRef}
        style={{
          position: "relative",
          height: "100vh",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.45,
          }}
        >
          <source src={data.assets.heroVideo} type="video/mp4" />
        </video>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            textAlign: "center",
            padding: "0 24px",
            maxWidth: "900px",
          }}
        >
          <img
            src={data.assets.logo}
            alt={data.name + " logo"}
            style={{ height: "70px", marginBottom: "40px", objectFit: "contain" }}
          />
          <h1
            style={{
              fontSize: "clamp(2.5rem, 6vw, 5rem)",
              fontWeight: 200,
              letterSpacing: "0.08em",
              marginBottom: "20px",
              color: "#ffffff",
              lineHeight: 1.1,
            }}
          >
            {data.name}
          </h1>
          <p
            style={{
              fontSize: "1.25rem",
              color: "${accentColor}",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "48px",
            }}
          >
            {data.sector} · {data.zone}
          </p>
          <a
            href={"#experiencia"}
            style={{
              display: "inline-block",
              padding: "16px 48px",
              border: "1px solid ${accentColor}",
              color: "${accentColor}",
              textDecoration: "none",
              fontWeight: 400,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontSize: "0.875rem",
              transition: "all 0.3s ease",
            }}
          >
            Descubrir
          </a>
        </div>
      </section>

      {/* Section 2: About */}
      <section
        style={{
          padding: "100px 24px",
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.75rem, 3.5vw, 3rem)",
            fontWeight: 300,
            marginBottom: "32px",
            color: "${accentColor}",
          }}
        >
          Sobre {data.name}
        </h2>
        <p style={{ fontSize: "1.125rem", lineHeight: 1.9, color: "#cccccc", marginBottom: "24px" }}>
          {data.diagnosis}
        </p>
        <p style={{ fontSize: "1rem", lineHeight: 1.8, color: "#999999" }}>
          Sector: {data.sector} · Zona: {data.zone}
        </p>
      </section>

      {/* Section 3: Gallery */}
      <section style={{ padding: "40px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
            gap: "4px",
            maxWidth: "1400px",
            margin: "0 auto",
          }}
        >
          {data.assets.propertyImages.slice(0, 6).map((src, i) => (
            <img
              key={i}
              src={src}
              alt={data.name + " propiedad " + (i + 1)}
              style={{
                width: "100%",
                aspectRatio: "16/10",
                objectFit: "cover",
                display: "block",
              }}
            />
          ))}
        </div>
      </section>

      {/* Section 4: Visual Experience Banner (Rubik embed) */}
      <section
        id="experiencia"
        style={{
          padding: "80px 24px",
          background: "${primaryColor}",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
            fontWeight: 300,
            marginBottom: "40px",
            color: "${accentColor}",
          }}
        >
          Experiencia Visual
        </h2>
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            aspectRatio: "16/9",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <iframe
            src={VISUAL_EXPERIENCE_URL}
            title={"Experiencia Visual " + data.name}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              position: "absolute",
              inset: 0,
            }}
            allow="autoplay; fullscreen"
            loading="lazy"
          />
        </div>
      </section>

      {/* Section 5: Features */}
      <section
        style={{
          padding: "100px 24px",
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
            fontWeight: 300,
            marginBottom: "60px",
            textAlign: "center",
            color: "${accentColor}",
          }}
        >
          Por qué elegirnos
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "40px",
          }}
        >
          {[
            { title: "Experiencia Premium", desc: "Más de una década en el sector inmobiliario de lujo." },
            { title: "Atención Personalizada", desc: "Cada cliente recibe un servicio exclusivo y adaptado." },
            { title: "Ubicaciones Exclusivas", desc: "Selección de propiedades en las mejores zonas." },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "48px",
                  height: "2px",
                  background: "${accentColor}",
                  margin: "0 auto 24px",
                }}
              />
              <h3
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 500,
                  marginBottom: "12px",
                  color: "#ffffff",
                }}
              >
                {item.title}
              </h3>
              <p style={{ fontSize: "0.9375rem", color: "#999999", lineHeight: 1.7 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 6: Properties CTA */}
      <section
        style={{
          padding: "80px 24px",
          background: "linear-gradient(135deg, ${primaryColor} 0%, #0d0d1a 100%)",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
            fontWeight: 300,
            marginBottom: "24px",
            color: "#ffffff",
          }}
        >
          Propiedades Disponibles
        </h2>
        <p style={{ color: "#cccccc", marginBottom: "40px", fontSize: "1.0625rem" }}>
          Descubra nuestra selección exclusiva en {data.zone}.
        </p>
        <a
          href={data.website}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "16px 48px",
            background: "${accentColor}",
            color: "${primaryColor}",
            textDecoration: "none",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontSize: "0.875rem",
          }}
        >
          Ver propiedades
        </a>
      </section>

      {/* Section 7: Testimonials placeholder */}
      <section
        style={{
          padding: "100px 24px",
          maxWidth: "900px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
            fontWeight: 300,
            marginBottom: "60px",
            color: "${accentColor}",
          }}
        >
          Clientes Satisfechos
        </h2>
        <blockquote
          style={{
            fontSize: "1.125rem",
            fontStyle: "italic",
            color: "#cccccc",
            lineHeight: 1.8,
            borderLeft: "2px solid ${accentColor}",
            paddingLeft: "24px",
            textAlign: "left",
          }}
        >
          "La experiencia con {data.name} superó todas nuestras expectativas. Profesionalidad y
          atención al detalle en cada paso del proceso."
        </blockquote>
      </section>

      {/* Section 8: Contact */}
      <section
        id="contacto"
        style={{
          padding: "100px 24px",
          background: "${primaryColor}",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(1.5rem, 3vw, 2rem)",
            fontWeight: 300,
            marginBottom: "16px",
            color: "${accentColor}",
          }}
        >
          Contacto
        </h2>
        <p style={{ color: "#999999", marginBottom: "40px" }}>
          Estamos aquí para ayudarle a encontrar su propiedad ideal.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
          {data.website && (
            <a
              href={data.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#ffffff", textDecoration: "none", fontSize: "1rem" }}
            >
              {data.website}
            </a>
          )}
          {data.email && (
            <a
              href={"mailto:" + data.email}
              style={{ color: "${accentColor}", textDecoration: "none", fontSize: "1rem" }}
            >
              {data.email}
            </a>
          )}
          {data.phone && (
            <a
              href={"tel:" + data.phone}
              style={{ color: "#ffffff", textDecoration: "none", fontSize: "1rem" }}
            >
              {data.phone}
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
`;

  files.push({
    repo: "aurum",
    path: `src/components/clientDemos/${componentName}WebCompleta.tsx`,
    content: webCompletaContent,
    encoding: "utf8",
    purpose: "Componente Web Completa funcional (8 secciones, hero video motion)",
  });

  // ── 4. Router registration patch ───────────────────────────────────────────
  const routerPatchContent = `// Auto-generated router registration patch for ${name}
// Add these imports and routes to src/App.tsx (or your router file)
//
// IMPORTS TO ADD:
// import ${componentName}Landing from "./components/clientDemos/${componentName}Landing";
// import ${componentName}WebCompleta from "./components/clientDemos/${componentName}WebCompleta";
//
// ROUTES TO ADD (React Router v6 pattern):
// <Route path="/${slug}" element={<${componentName}Landing />} />
// <Route path="/${slug}-web-completa" element={<${componentName}WebCompleta />} />
//
// This file is informational only — apply manually or via automated router injection.
`;

  files.push({
    repo: "aurum",
    path: `src/components/clientDemos/${componentName}RouterPatch.md`,
    content: routerPatchContent,
    encoding: "utf8",
    purpose: "Instrucciones de registro de rutas en App.tsx",
  });

  return { ok: errors.length === 0, files, assetMode, warnings, errors };
}

// ─── Rubik Generator ──────────────────────────────────────────────────────────

/**
 * Generates functional Rubik files for a new lead.
 * Patterns: Embassy Levante WebGL, Costa Invest banner pack, Casas y Mar.
 * Reuses stable banner-engine pattern — does NOT create a new engine.
 */
export function buildRubikFiles(payload: Record<string, unknown>): GeneratorResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const files: GeneratedFile[] = [];

  const lead = (payload.lead || {}) as Record<string, unknown>;
  const slug = sanitizeSlug(String(lead.slug || ""));
  const name = String(lead.name || slug);
  const website = String(lead.website || "");

  const mediaAssets = (payload.mediaAssets || {}) as Record<string, unknown>;
  const legacyAssets = (payload.assets || {}) as Record<string, unknown>;

  const logoUrl = pickLogoUrl(mediaAssets, legacyAssets);
  const heroImageUrl = pickFirstImageUrl(mediaAssets, legacyAssets);
  const propertyImages = pickPropertyImages(mediaAssets, legacyAssets);
  const brandColors = pickBrandColors(mediaAssets);

  const hasRealLogo = Boolean(logoUrl);
  const hasRealHero = Boolean(heroImageUrl);
  const hasRealImages = propertyImages.length > 0;

  if (!hasRealLogo) warnings.push("rubik: logo missing — using fallback placeholder");
  if (!hasRealHero) warnings.push("rubik: heroImage missing — using fallback placeholder");
  if (!hasRealImages) warnings.push("rubik: propertyImages missing — banners will use fallback");

  const assetMode = resolveAssetMode(hasRealLogo, hasRealHero, hasRealImages);

  const fallbackLogo = `https://via.placeholder.com/200x60/1a1a2e/d4af37?text=${encodeURIComponent(name)}`;
  const fallbackHero = "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1920&q=80";
  const fallbackGallery = [
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80",
  ];

  const resolvedLogo = logoUrl || fallbackLogo;
  const resolvedHero = heroImageUrl || fallbackHero;
  const resolvedImages = propertyImages.length > 0 ? propertyImages : fallbackGallery;

  const primaryColor = brandColors[0] || "#1a1a2e";
  const accentColor = brandColors[1] || "#d4af37";

  // ── 1. config.js ────────────────────────────────────────────────────────────
  const configContent = `// Auto-generated by immersphere-production-orchestrator v0.3.0
// Lead: ${name} | Slug: ${slug}
// Rubik dynamic-motion-banner config — reuses stable engine pattern

window.BANNER_CONFIG = {
  slug: "${slug}",
  name: "${name}",
  website: "${website}",
  assetMode: "${assetMode}",
  assets: {
    logo: "${resolvedLogo}",
    heroImage: "${resolvedHero}",
    images: ${JSON.stringify(resolvedImages.slice(0, 4), null, 4)},
    brandColors: ${JSON.stringify(brandColors)},
  },
  copy: {
    headline: "${name}",
    subheadline: "Experiencia Inmobiliaria Premium",
    cta: "Descubrir",
    ctaUrl: "${website}",
  },
  motion: {
    autoplay: true,
    loop: true,
    transitionDuration: 800,
    kenBurns: true,
  },
};
`;

  files.push({
    repo: "rubik",
    path: `dynamic-motion-banner/${slug}/config.js`,
    content: configContent,
    encoding: "utf8",
    purpose: "Config real por cliente para banderola dinámica",
  });

  // ── 2. banner-engine.js (stable engine reuse) ───────────────────────────────
  // This reuses the stable engine pattern from existing leads.
  // It does NOT create a new engine — it's a thin adapter that loads config
  // and delegates to the shared engine already deployed in Rubik.
  const engineContent = `// Auto-generated by immersphere-production-orchestrator v0.3.0
// Lead: ${name} | Slug: ${slug}
// Stable engine adapter — delegates to shared Rubik engine pattern
// Pattern: Costa Invest, Embassy Levante, Casas y Mar

(function () {
  "use strict";

  var config = window.BANNER_CONFIG;
  if (!config) {
    console.error("[banner-engine] BANNER_CONFIG not found. Load config.js first.");
    return;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  var currentIndex = 0;
  var images = config.assets.images || [config.assets.heroImage];
  var isPlaying = config.motion.autoplay !== false;
  var intervalId = null;

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function qs(selector) {
    return document.querySelector(selector);
  }

  function setAttr(el, attr, value) {
    if (el) el.setAttribute(attr, value);
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  // ── Image transition ───────────────────────────────────────────────────────
  function showImage(index) {
    var bg = qs(".banner-bg");
    if (!bg) return;
    var img = images[index % images.length];
    bg.style.transition = "opacity " + (config.motion.transitionDuration || 800) + "ms ease";
    bg.style.opacity = "0";
    setTimeout(function () {
      bg.style.backgroundImage = "url(" + img + ")";
      bg.style.opacity = "1";
      if (config.motion.kenBurns) {
        bg.style.animation = "none";
        void bg.offsetWidth; // reflow
        bg.style.animation = "kenBurns " + (config.motion.transitionDuration * 8 || 6400) + "ms ease-in-out infinite alternate";
      }
    }, config.motion.transitionDuration || 800);
  }

  function nextImage() {
    currentIndex = (currentIndex + 1) % images.length;
    showImage(currentIndex);
  }

  function startSlideshow() {
    if (images.length > 1 && isPlaying) {
      intervalId = setInterval(nextImage, (config.motion.transitionDuration || 800) * 5);
    }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // Logo
    var logoEl = qs(".banner-logo");
    if (logoEl) {
      setAttr(logoEl, "src", config.assets.logo);
      setAttr(logoEl, "alt", config.name + " logo");
    }

    // Background
    var bg = qs(".banner-bg");
    if (bg) {
      bg.style.backgroundImage = "url(" + images[0] + ")";
      bg.style.backgroundSize = "cover";
      bg.style.backgroundPosition = "center";
    }

    // Copy
    setText(qs(".banner-headline"), config.copy.headline);
    setText(qs(".banner-subheadline"), config.copy.subheadline);
    setText(qs(".banner-cta"), config.copy.cta);

    // CTA link
    var ctaEl = qs(".banner-cta-link");
    if (ctaEl) setAttr(ctaEl, "href", config.copy.ctaUrl);

    // Start slideshow
    startSlideshow();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
`;

  files.push({
    repo: "rubik",
    path: `dynamic-motion-banner/${slug}/banner-engine.js`,
    content: engineContent,
    encoding: "utf8",
    purpose: "Motor de banners estable (adapter pattern, no engine nuevo)",
  });

  // ── 3. banner-pack/index.html ───────────────────────────────────────────────
  const bannerPackHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — Banner Pack</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background: #0a0a0a;
      color: #f5f5f5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 40px;
      padding: 40px 24px;
    }
    h1 { font-size: 1.5rem; font-weight: 300; color: ${accentColor}; letter-spacing: 0.1em; }
    .banner-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
      width: 100%;
      max-width: 1200px;
    }
    .banner-frame {
      background: ${primaryColor};
      border: 1px solid rgba(255,255,255,0.1);
      overflow: hidden;
    }
    .banner-frame iframe {
      width: 100%;
      border: none;
      display: block;
    }
    .banner-label {
      padding: 8px 16px;
      font-size: 0.75rem;
      color: #999;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-top: 1px solid rgba(255,255,255,0.05);
    }
    @keyframes kenBurns {
      from { transform: scale(1) translate(0, 0); }
      to { transform: scale(1.08) translate(-2%, -1%); }
    }
  </style>
</head>
<body>
  <h1>${name} — Banner Pack</h1>
  <div class="banner-grid">
    <div class="banner-frame">
      <iframe
        src="../banner-vertical.html"
        title="${name} Banner Vertical"
        style="height: 500px;"
        loading="lazy"
      ></iframe>
      <div class="banner-label">Banner Vertical</div>
    </div>
    <div class="banner-frame">
      <iframe
        src="../banner-horizontal.html"
        title="${name} Banner Horizontal"
        style="height: 250px;"
        loading="lazy"
      ></iframe>
      <div class="banner-label">Banner Horizontal</div>
    </div>
  </div>
</body>
</html>
`;

  files.push({
    repo: "rubik",
    path: `dynamic-motion-banner/${slug}/banner-pack/index.html`,
    content: bannerPackHtml,
    encoding: "utf8",
    purpose: "Banner pack index con iframes a vertical y horizontal",
  });

  // ── 4. banner-vertical.html ─────────────────────────────────────────────────
  const bannerVerticalHtml = buildBannerHtml({
    name,
    slug,
    resolvedLogo,
    resolvedHero,
    resolvedImages,
    primaryColor,
    accentColor,
    width: "400px",
    height: "700px",
    orientation: "vertical",
    website,
  });

  files.push({
    repo: "rubik",
    path: `dynamic-motion-banner/${slug}/banner-vertical.html`,
    content: bannerVerticalHtml,
    encoding: "utf8",
    purpose: "Banner vertical funcional (standalone HTML)",
  });

  // ── 5. banner-horizontal.html ───────────────────────────────────────────────
  const bannerHorizontalHtml = buildBannerHtml({
    name,
    slug,
    resolvedLogo,
    resolvedHero,
    resolvedImages,
    primaryColor,
    accentColor,
    width: "728px",
    height: "90px",
    orientation: "horizontal",
    website,
  });

  files.push({
    repo: "rubik",
    path: `dynamic-motion-banner/${slug}/banner-horizontal.html`,
    content: bannerHorizontalHtml,
    encoding: "utf8",
    purpose: "Banner horizontal funcional (standalone HTML)",
  });

  // ── 6. gesture-lab Visual Experience ───────────────────────────────────────
  const gestureLabHtml = buildVisualExperienceHtml({
    name,
    slug,
    resolvedLogo,
    resolvedHero,
    resolvedImages,
    primaryColor,
    accentColor,
    website,
  });

  files.push({
    repo: "rubik",
    path: `gesture-lab/${slug}-v1.html`,
    content: gestureLabHtml,
    encoding: "utf8",
    purpose: "Visual Experience real (gesture-lab, Rubik internal)",
  });

  // ── 7. vercel.json rewrite patch ────────────────────────────────────────────
  const vercelPatchContent = `// vercel.json rewrite patch for ${name} (${slug})
// Add these entries to the "rewrites" array in vercel.json:
//
// { "source": "/gesture-lab/${slug}-v1", "destination": "/gesture-lab/${slug}-v1.html" },
// { "source": "/dynamic-motion-banner/${slug}/banner-pack", "destination": "/dynamic-motion-banner/${slug}/banner-pack/index.html" },
// { "source": "/dynamic-motion-banner/${slug}/banner-vertical", "destination": "/dynamic-motion-banner/${slug}/banner-vertical.html" },
// { "source": "/dynamic-motion-banner/${slug}/banner-horizontal", "destination": "/dynamic-motion-banner/${slug}/banner-horizontal.html" },
//
// This file is informational only — apply manually or via automated vercel.json injection.
`;

  files.push({
    repo: "rubik",
    path: `dynamic-motion-banner/${slug}/vercel-rewrite-patch.md`,
    content: vercelPatchContent,
    encoding: "utf8",
    purpose: "Instrucciones de rewrites para vercel.json",
  });

  return { ok: errors.length === 0, files, assetMode, warnings, errors };
}

// ─── Banner HTML builder ───────────────────────────────────────────────────────

interface BannerHtmlOptions {
  name: string;
  slug: string;
  resolvedLogo: string;
  resolvedHero: string;
  resolvedImages: string[];
  primaryColor: string;
  accentColor: string;
  width: string;
  height: string;
  orientation: "vertical" | "horizontal";
  website: string;
}

function buildBannerHtml(opts: BannerHtmlOptions): string {
  const { name, slug, resolvedLogo, resolvedImages, primaryColor, accentColor, width, height, orientation, website } = opts;
  const isHorizontal = orientation === "horizontal";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — Banner ${orientation === "vertical" ? "Vertical" : "Horizontal"}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width};
      height: ${height};
      overflow: hidden;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    }
    .banner-bg {
      position: absolute;
      inset: 0;
      background-image: url('${resolvedImages[0]}');
      background-size: cover;
      background-position: center;
      transition: opacity 800ms ease;
    }
    .banner-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        ${isHorizontal ? "90deg" : "180deg"},
        ${primaryColor}cc 0%,
        ${primaryColor}88 50%,
        transparent 100%
      );
    }
    .banner-content {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: ${isHorizontal ? "row" : "column"};
      align-items: center;
      justify-content: ${isHorizontal ? "flex-start" : "center"};
      padding: ${isHorizontal ? "0 20px" : "24px"};
      gap: ${isHorizontal ? "16px" : "12px"};
    }
    .banner-logo {
      height: ${isHorizontal ? "32px" : "48px"};
      object-fit: contain;
      flex-shrink: 0;
    }
    .banner-text {
      display: flex;
      flex-direction: column;
      gap: ${isHorizontal ? "2px" : "8px"};
      ${isHorizontal ? "flex: 1;" : "text-align: center;"}
    }
    .banner-headline {
      font-size: ${isHorizontal ? "0.875rem" : "1.25rem"};
      font-weight: 600;
      color: #ffffff;
      letter-spacing: 0.05em;
      white-space: ${isHorizontal ? "nowrap" : "normal"};
    }
    .banner-subheadline {
      font-size: ${isHorizontal ? "0.6875rem" : "0.8125rem"};
      color: ${accentColor};
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: ${isHorizontal ? "nowrap" : "normal"};
    }
    .banner-cta-link {
      display: inline-block;
      padding: ${isHorizontal ? "6px 16px" : "10px 24px"};
      background: ${accentColor};
      color: ${primaryColor};
      text-decoration: none;
      font-weight: 700;
      font-size: ${isHorizontal ? "0.6875rem" : "0.8125rem"};
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
      flex-shrink: 0;
    }
    @keyframes kenBurns {
      from { transform: scale(1) translate(0, 0); }
      to { transform: scale(1.08) translate(-2%, -1%); }
    }
  </style>
</head>
<body>
  <div class="banner-bg"></div>
  <div class="banner-overlay"></div>
  <div class="banner-content">
    <img class="banner-logo" src="${resolvedLogo}" alt="${name} logo" />
    <div class="banner-text">
      <div class="banner-headline">${name}</div>
      <div class="banner-subheadline">Experiencia Inmobiliaria Premium</div>
    </div>
    <a class="banner-cta-link banner-cta" href="${website}" target="_blank" rel="noopener">
      Descubrir
    </a>
  </div>
  <script src="../config.js"></script>
  <script src="../banner-engine.js"></script>
</body>
</html>
`;
}

// ─── Visual Experience HTML builder ───────────────────────────────────────────

interface VisualExperienceOptions {
  name: string;
  slug: string;
  resolvedLogo: string;
  resolvedHero: string;
  resolvedImages: string[];
  primaryColor: string;
  accentColor: string;
  website: string;
}

function buildVisualExperienceHtml(opts: VisualExperienceOptions): string {
  const { name, slug, resolvedLogo, resolvedImages, primaryColor, accentColor, website } = opts;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name} — Experiencia Visual</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      background: ${primaryColor};
    }
    .ve-bg {
      position: fixed;
      inset: 0;
      background-image: url('${resolvedImages[0]}');
      background-size: cover;
      background-position: center;
      transition: opacity 1200ms ease;
      animation: kenBurns 12000ms ease-in-out infinite alternate;
    }
    .ve-overlay {
      position: fixed;
      inset: 0;
      background: linear-gradient(
        180deg,
        ${primaryColor}99 0%,
        transparent 40%,
        transparent 60%,
        ${primaryColor}cc 100%
      );
    }
    .ve-content {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 40px;
      text-align: center;
    }
    .ve-logo {
      height: 64px;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
    }
    .ve-title {
      font-size: clamp(2rem, 5vw, 4.5rem);
      font-weight: 200;
      color: #ffffff;
      letter-spacing: 0.08em;
      line-height: 1.1;
      text-shadow: 0 2px 20px rgba(0,0,0,0.6);
    }
    .ve-subtitle {
      font-size: clamp(0.875rem, 2vw, 1.125rem);
      color: ${accentColor};
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .ve-cta {
      display: inline-block;
      margin-top: 16px;
      padding: 14px 40px;
      border: 1px solid ${accentColor};
      color: ${accentColor};
      text-decoration: none;
      font-size: 0.875rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      transition: all 0.3s ease;
    }
    .ve-cta:hover {
      background: ${accentColor};
      color: ${primaryColor};
    }
    .ve-thumbnails {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
    }
    .ve-thumb {
      width: 48px;
      height: 32px;
      object-fit: cover;
      opacity: 0.5;
      cursor: pointer;
      transition: opacity 0.3s ease;
      border: 1px solid transparent;
    }
    .ve-thumb.active, .ve-thumb:hover {
      opacity: 1;
      border-color: ${accentColor};
    }
    @keyframes kenBurns {
      from { transform: scale(1) translate(0, 0); }
      to { transform: scale(1.1) translate(-2%, -1.5%); }
    }
  </style>
</head>
<body>
  <div class="ve-bg" id="veBg"></div>
  <div class="ve-overlay"></div>
  <div class="ve-content">
    <img class="ve-logo" src="${resolvedLogo}" alt="${name} logo" />
    <h1 class="ve-title">${name}</h1>
    <p class="ve-subtitle">Experiencia Visual Premium</p>
    <a class="ve-cta" href="${website}" target="_blank" rel="noopener">
      Descubrir
    </a>
  </div>
  <div class="ve-thumbnails" id="veThumbs"></div>

  <script>
    (function () {
      var images = ${JSON.stringify(resolvedImages.slice(0, 6))};
      var current = 0;
      var bg = document.getElementById("veBg");
      var thumbsContainer = document.getElementById("veThumbs");

      // Build thumbnails
      images.forEach(function (src, i) {
        var img = document.createElement("img");
        img.src = src;
        img.className = "ve-thumb" + (i === 0 ? " active" : "");
        img.addEventListener("click", function () { goTo(i); });
        thumbsContainer.appendChild(img);
      });

      function goTo(index) {
        current = index;
        bg.style.opacity = "0";
        setTimeout(function () {
          bg.style.backgroundImage = "url(" + images[index] + ")";
          bg.style.opacity = "1";
          bg.style.animation = "none";
          void bg.offsetWidth;
          bg.style.animation = "kenBurns 12000ms ease-in-out infinite alternate";
        }, 600);
        document.querySelectorAll(".ve-thumb").forEach(function (el, i) {
          el.classList.toggle("active", i === index);
        });
      }

      // Auto-advance
      if (images.length > 1) {
        setInterval(function () {
          goTo((current + 1) % images.length);
        }, 6000);
      }
    })();
  </script>
</body>
</html>
`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates generated files for syntax correctness.
 * - TypeScript/TSX: checks for common syntax issues
 * - JSON: validates JSON files
 * - HTML: validates basic HTML structure
 */
export function validateGeneratedFiles(files: GeneratedFile[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const { path, content } = file;

    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      validateTypeScriptFile(path, content, errors, warnings);
    } else if (path.endsWith(".json")) {
      validateJsonFile(path, content, errors);
    } else if (path.endsWith(".html")) {
      validateHtmlFile(path, content, errors, warnings);
    } else if (path.endsWith(".js")) {
      validateJsFile(path, content, errors, warnings);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateTypeScriptFile(path: string, content: string, errors: string[], warnings: string[]): void {
  // Check for unclosed braces/brackets
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    errors.push(`${path}: unbalanced_braces (open=${openBraces}, close=${closeBraces})`);
  }

  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  if (Math.abs(openParens - closeParens) > 2) {
    errors.push(`${path}: unbalanced_parentheses (open=${openParens}, close=${closeParens})`);
  }

  // Check for required React import in TSX files
  if (path.endsWith(".tsx") && !content.includes("import React")) {
    errors.push(`${path}: missing_react_import`);
  }

  // Check for export default in component files
  if (path.endsWith(".tsx") && !content.includes("export default function")) {
    errors.push(`${path}: missing_export_default_function`);
  }

  // Check for export in data files
  if (path.endsWith(".ts") && path.includes("/data/") && !content.includes("export const")) {
    errors.push(`${path}: missing_export_const_in_data_file`);
  }

  // Warn about placeholder content
  if (content.includes("TODO") || content.includes("FIXME")) {
    warnings.push(`${path}: contains_todo_or_fixme`);
  }

  // Check for script injection patterns
  if (/<\s*script/i.test(content) && !path.endsWith(".tsx")) {
    warnings.push(`${path}: contains_script_tag_in_ts_file`);
  }
}

function validateJsonFile(path: string, content: string, errors: string[]): void {
  try {
    JSON.parse(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : "parse_error";
    errors.push(`${path}: invalid_json — ${message}`);
  }
}

function validateHtmlFile(path: string, content: string, errors: string[], warnings: string[]): void {
  // Check for DOCTYPE
  if (!content.includes("<!DOCTYPE html>")) {
    errors.push(`${path}: missing_doctype`);
  }

  // Check for html/head/body tags
  if (!content.includes("<html")) {
    errors.push(`${path}: missing_html_tag`);
  }
  if (!content.includes("<head")) {
    errors.push(`${path}: missing_head_tag`);
  }
  if (!content.includes("<body")) {
    errors.push(`${path}: missing_body_tag`);
  }

  // Check for charset
  if (!content.includes("charset")) {
    warnings.push(`${path}: missing_charset_meta`);
  }

  // Check for viewport
  if (!content.includes("viewport")) {
    warnings.push(`${path}: missing_viewport_meta`);
  }

  // Check for unclosed tags (basic)
  const openTags = (content.match(/<[a-z][^/!>]*>/gi) || []).length;
  const closeTags = (content.match(/<\/[a-z][^>]*>/gi) || []).length;
  const selfClosing = (content.match(/<[a-z][^>]*\/>/gi) || []).length;
  if (Math.abs(openTags - closeTags - selfClosing) > 5) {
    warnings.push(`${path}: possibly_unbalanced_html_tags`);
  }
}

function validateJsFile(path: string, content: string, errors: string[], warnings: string[]): void {
  // Check for unclosed braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    errors.push(`${path}: unbalanced_braces (open=${openBraces}, close=${closeBraces})`);
  }

  // Check for unclosed parens
  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  if (Math.abs(openParens - closeParens) > 2) {
    errors.push(`${path}: unbalanced_parentheses (open=${openParens}, close=${closeParens})`);
  }

  // Warn about eval
  if (content.includes("eval(")) {
    warnings.push(`${path}: contains_eval`);
  }
}
