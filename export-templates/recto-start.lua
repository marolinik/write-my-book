--- recto-start.lua
--- Pandoc Lua filter: Forces chapter-level pages (a chapter's H1, or a
--- half-title/title/book-part div that holds one) to begin on odd (recto)
--- pages in DOCX and PDF (Typst) output.
---
---   DOCX: a raw OOXML section break with type "oddPage".
---   Typst: a weak odd-page break, so a page already fresh and odd gets no
---          blank one before it. The template used to be credited with recto
---          starts; it never did them, so final PDFs started chapters on verso
---          pages (P3-S18).
---
--- The break goes BETWEEN top-level blocks: the Typst writer wraps a div in a
--- block, and Typst refuses a page break inside a container. Nothing goes
--- before the first chapter-level page when nothing precedes it: in DOCX that
--- break opened the document on an empty section and two blank pages. In
--- DOCX the section break also replaces the page break right before it, which
--- would otherwise push the section break onto a page of its own.
---
--- EPUB splits by chapter natively and has no pages to face.
---
--- Draft mode: Skips recto-start when metadata flag `draft-mode` is true.
--- Draft mode omits typesetting niceties per locked decision.
---
--- Filter order in pipeline: 7th (conditional, final mode only)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

local draft_mode = false

--- Read draft-mode flag from document metadata.
local function Meta(meta)
  if meta["draft-mode"] then
    draft_mode = pandoc.utils.stringify(meta["draft-mode"]) == "true"
  end
end

--- True when a top-level block opens a chapter-level page: an H1, or a div
--- (half-title, title page, omnibus book title) that holds one.
--- @param block pandoc.Block
--- @return boolean
local function opens_recto_page(block)
  if block.t == 'Header' then
    return block.level == 1
  end
  if block.t == 'Div' then
    for _, inner in ipairs(block.content) do
      if inner.t == 'Header' and inner.level == 1 then
        return true
      end
    end
  end
  return false
end

--- True for the page break pagebreak.lua made of a `\newpage`.
--- @param block pandoc.Block
--- @return boolean
local function is_page_break(block)
  return block.t == 'RawBlock'
    and (block.text:match('w:br w:type="page"') ~= nil
      or block.text:match('^#pagebreak%(%)$') ~= nil)
end

--- The format's recto break, or nil for a format without facing pages.
--- @return pandoc.Block|nil
local function recto_break()
  if FORMAT:match 'docx' then
    return pandoc.RawBlock('openxml',
      '<w:p><w:pPr><w:sectPr><w:type w:val="oddPage"/></w:sectPr></w:pPr></w:p>')
  elseif FORMAT:match 'typst' then
    return pandoc.RawBlock('typst', '#pagebreak(to: "odd", weak: true)')
  end
  return nil
end

--- Put a recto break before every chapter-level page but the first.
--- @param doc pandoc.Pandoc
--- @return pandoc.Pandoc|nil
local function Pandoc(doc)
  if draft_mode or recto_break() == nil then
    return nil
  end

  local blocks = pandoc.List()
  local content_before = false
  for _, block in ipairs(doc.blocks) do
    if opens_recto_page(block) and content_before then
      if FORMAT:match 'docx' and #blocks > 0 and is_page_break(blocks[#blocks]) then
        blocks:remove(#blocks)
      end
      blocks:insert(recto_break())
    end
    blocks:insert(block)
    if not is_page_break(block) then
      content_before = true
    end
  end
  doc.blocks = blocks
  return doc
end

-- Two-pass filter: Meta reads draft-mode flag first, then Pandoc places the
-- recto starts
return {{Meta = Meta}, {Pandoc = Pandoc}}
