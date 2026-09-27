--- toc.lua
--- Pandoc Lua filter: Turns the front matter's table-of-contents marker into
--- the contents of the output format.
---
--- The marker is a `.toc` div holding raw LaTeX `\tableofcontents`, with the
--- heading in the book's language as its `title` attribute. Only a LaTeX
--- writer understands the raw block; the Typst writer drops it, so every PDF
--- carried a contents page with nothing on it (P3-S18).
---
---   Typst: #outline() of the chapter headings (level 1), under that heading.
---          The book's own title pages are `unlisted`, so they stay out of it.
---   Other formats: unchanged.
---
--- Filter order in pipeline: 6th (runs after special-format.lua)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

--- Quote a string as a Typst string literal.
--- @param s string
--- @return string
local function typst_string(s)
  return '"' .. (s:gsub('\\', '\\\\'):gsub('"', '\\"')) .. '"'
end

--- Replace the `.toc` marker with the format's own table of contents.
--- @param el pandoc.Div
--- @return pandoc.Block|nil
local function Div(el)
  if not el.classes:includes('toc') then
    return nil
  end

  if FORMAT:match 'typst' then
    local title = el.attributes['title'] or 'Contents'
    return pandoc.RawBlock('typst',
      '#outline(title: ' .. typst_string(title) .. ', depth: 1)')
  end

  return nil
end

return {{Div = Div}}
