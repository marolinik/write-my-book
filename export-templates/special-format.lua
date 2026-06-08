--- special-format.lua
--- Pandoc Lua filter: Detects fenced divs with specific class names for
--- special fiction formatting and applies format-specific styling.
---
--- Supported classes:
---   .letter       -- Letters/correspondence (serif, indented)
---   .text-message -- Text messages/SMS (sans-serif, speech bubble)
---   .journal      -- Journal/diary entries (handwriting-style)
---   .document     -- In-world documents (bordered, monospace)
---   .telegram     -- Telegrams/formal messages (uppercase, bordered)
---
--- Unrecognized fenced div classes pass through unchanged.
---
--- Filter order in pipeline: 5th (runs after epigraph.lua)
--- Consumer: write-my-book/workflows/wmb-export.md Step 8

--- Set of recognized special format classes.
local SPECIAL_CLASSES = {
  letter = true,
  ['text-message'] = true,
  journal = true,
  document = true,
  telegram = true,
}

--- Map class names to DOCX custom-style names.
local DOCX_STYLES = {
  letter = 'Letter',
  ['text-message'] = 'Text Message',
  journal = 'Journal Entry',
  document = 'Document Insert',
  telegram = 'Telegram',
}

--- Generate Typst styling for each special format class.
--- @param class_name string The fenced div class
--- @param content string The stringified block content
--- @return string The Typst code wrapping the content
local function typst_wrap(class_name, content)
  if class_name == 'letter' then
    return '#block(inset: (left: 2em, right: 2em), above: 1em, below: 1em)[\n'
      .. '#set text(style: "italic")\n'
      .. content .. '\n'
      .. ']'

  elseif class_name == 'text-message' then
    return '#block(above: 1em, below: 1em)[\n'
      .. '#set text(font: "sans-serif", size: 0.9em)\n'
      .. '#block(fill: luma(240), inset: 8pt, radius: 8pt)[\n'
      .. content .. '\n'
      .. ']\n'
      .. ']'

  elseif class_name == 'journal' then
    return '#block(inset: (left: 1em, right: 1em), above: 1em, below: 1em)[\n'
      .. '#set text(style: "italic")\n'
      .. '#emph[' .. content .. ']\n'
      .. ']'

  elseif class_name == 'document' then
    return '#block(stroke: 0.5pt + luma(100), inset: 12pt, above: 1em, below: 1em)[\n'
      .. '#set text(font: "monospace", size: 0.9em)\n'
      .. content .. '\n'
      .. ']'

  elseif class_name == 'telegram' then
    return '#block(stroke: 1pt + luma(50), inset: 12pt, above: 1em, below: 1em)[\n'
      .. '#set text(tracking: 0.1em)\n'
      .. '#upper[' .. content .. ']\n'
      .. ']'

  else
    return content
  end
end

--- Process Div elements for special fiction formatting.
--- @param el pandoc.Div The div element to check
--- @return pandoc.Block|nil Formatted block or nil for pass-through
local function Div(el)
  -- Find the first recognized special class
  local matched_class = nil
  for _, class in ipairs(el.classes) do
    if SPECIAL_CLASSES[class] then
      matched_class = class
      break
    end
  end

  -- No recognized class: pass through unchanged
  if not matched_class then
    return nil
  end

  if FORMAT:match 'docx' then
    -- DOCX: Apply custom-style matching the class name
    local style_name = DOCX_STYLES[matched_class]
    el.attr = pandoc.Attr(el.identifier, el.classes, {{'custom-style', style_name}})
    return el

  elseif FORMAT:match 'html' or FORMAT:match 'epub' then
    -- EPUB/HTML: Preserve the div with its class name intact
    -- The EPUB/HTML CSS defines styling for each class
    -- The div already has the class, so just return as-is
    return nil

  elseif FORMAT:match 'typst' then
    -- Typst: Wrap content in styled Typst blocks
    local content = pandoc.write(pandoc.Pandoc(el.content), 'typst')
    local wrapped = typst_wrap(matched_class, content)
    return pandoc.RawBlock('typst', wrapped)

  elseif FORMAT:match 'latex' then
    -- LaTeX: Wrap in a framed/styled environment
    local content = pandoc.write(pandoc.Pandoc(el.content), 'latex')
    local latex_code
    if matched_class == 'letter' then
      latex_code = '\\begin{quotation}\\itshape\n' .. content .. '\\end{quotation}'
    elseif matched_class == 'text-message' then
      latex_code = '\\begin{quote}\\sffamily\\small\n' .. content .. '\\end{quote}'
    elseif matched_class == 'journal' then
      latex_code = '\\begin{quotation}\\itshape\n' .. content .. '\\end{quotation}'
    elseif matched_class == 'document' then
      latex_code = '\\begin{quote}\\ttfamily\\small\n' .. content .. '\\end{quote}'
    elseif matched_class == 'telegram' then
      latex_code = '\\begin{quote}\\MakeUppercase{' .. content .. '}\\end{quote}'
    else
      latex_code = content
    end
    return pandoc.RawBlock('latex', latex_code)

  else
    return nil
  end
end

return {{Div = Div}}
