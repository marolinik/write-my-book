--- draft-watermark.lua
--- Pandoc Lua filter: Injects a visible "DRAFT" watermark when the
--- metadata flag `draft-mode` is true.
---
--- The watermark is large, semi-transparent gray text, rotated approximately
--- 45 degrees, overlaid on every page without interfering with content.
---
--- Format-specific implementations:
---   DOCX: OOXML watermark in document header using VML shape
---   EPUB/HTML: Fixed-position CSS overlay with pointer-events: none
---   Typst: Page-level place() overlay with rotated text
---
--- Only activates when draft-mode metadata is true. In final mode,
--- this filter is a no-op.
---
--- Filter order in pipeline: 7th (conditional, draft mode only)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

local draft_mode = false
local watermark_injected = false

--- Read draft-mode flag from document metadata.
local function Meta(meta)
  if meta["draft-mode"] then
    draft_mode = pandoc.utils.stringify(meta["draft-mode"]) == "true"
  end
end

--- DOCX OOXML watermark using VML WordArt shape.
--- Injected once at the beginning of the document as a header element.
local function docx_watermark()
  -- OOXML watermark using a shape with "DRAFT" text
  -- This uses the standard Word watermark pattern via a pict element
  local ooxml = [[<w:p>
  <w:r>
    <w:rPr>
      <w:noProof/>
    </w:rPr>
    <w:pict>
      <v:shapetype id="_x0000_t136" coordsize="21600,21600"
        o:spt="136" adj="10800"
        path="m@7,l@8,m@5,21600l@6,21600e">
        <v:formulas>
          <v:f eqn="sum #0 0 10800"/>
          <v:f eqn="prod #0 2 1"/>
          <v:f eqn="sum 21600 0 @1"/>
          <v:f eqn="sum 0 0 @2"/>
          <v:f eqn="sum 21600 0 @3"/>
          <v:f eqn="if @0 @3 0"/>
          <v:f eqn="if @0 21600 @1"/>
          <v:f eqn="if @0 0 @2"/>
          <v:f eqn="if @0 @4 21600"/>
          <v:f eqn="mid @5 @6"/>
          <v:f eqn="mid @8 @5"/>
          <v:f eqn="mid @7 @8"/>
          <v:f eqn="mid @6 @7"/>
          <v:f eqn="sum @6 0 @5"/>
        </v:formulas>
        <v:path textpathok="t" o:connecttype="custom"
          o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800"
          o:connectangles="270,180,90,0"/>
        <v:textpath on="t" fitshape="t"/>
        <v:handles>
          <v:h position="#0,bottomRight" xrange="6629,14971"/>
        </v:handles>
        <o:lock v:ext="edit" text="t" shapetype="t"/>
      </v:shapetype>
      <v:shape id="PowerPlusWaterMarkObject"
        o:spid="_x0000_s2049" type="#_x0000_t136"
        style="position:absolute;margin-left:0;margin-top:0;width:527.85pt;height:131.95pt;rotation:315;z-index:-251658752;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin"
        o:allowincell="f"
        fillcolor="silver" stroked="f">
        <v:fill opacity=".25"/>
        <v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt"
          string="DRAFT"/>
      </v:shape>
    </w:pict>
  </w:r>
</w:p>]]
  return pandoc.RawBlock('openxml', ooxml)
end

--- EPUB/HTML watermark using CSS fixed-position overlay.
local function html_watermark()
  local html = [[<div class="draft-watermark" style="
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 8em;
  font-weight: bold;
  color: rgba(128, 128, 128, 0.15);
  pointer-events: none;
  z-index: 9999;
  user-select: none;
  white-space: nowrap;
  letter-spacing: 0.2em;
">DRAFT</div>]]
  return pandoc.RawBlock('html', html)
end

--- Typst watermark using page-level place() overlay.
local function typst_watermark()
  local typst = [[#set page(
  background: place(center + horizon,
    rotate(-45deg,
      text(size: 80pt, fill: luma(200).transparentize(75%))[DRAFT]
    )
  )
)]]
  return pandoc.RawBlock('typst', typst)
end

--- Inject watermark at the beginning of the document.
--- Uses Pandoc filter to prepend watermark to the document body.
local function Pandoc(doc)
  -- Only activate in draft mode
  if not draft_mode then
    return nil
  end

  -- Prevent double injection
  if watermark_injected then
    return nil
  end
  watermark_injected = true

  local watermark = nil

  if FORMAT:match 'docx' then
    watermark = docx_watermark()
  elseif FORMAT:match 'html' or FORMAT:match 'epub' then
    watermark = html_watermark()
  elseif FORMAT:match 'typst' then
    watermark = typst_watermark()
  elseif FORMAT:match 'latex' then
    -- LaTeX: Use draftwatermark-style approach
    watermark = pandoc.RawBlock('latex',
      '\\usepackage{draftwatermark}\n\\SetWatermarkText{DRAFT}\n\\SetWatermarkScale{1}\n\\SetWatermarkColor[gray]{0.85}')
  end

  if watermark then
    -- Prepend watermark block to document body
    table.insert(doc.blocks, 1, watermark)
    return doc
  end

  return nil
end

-- Two-pass filter: Meta reads draft-mode flag first, then Pandoc injects watermark
return {{Meta = Meta}, {Pandoc = Pandoc}}
