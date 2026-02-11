// WMB Typst Book Template — Basic book interior layout
// Used with: pandoc --pdf-engine=typst --template=typst-book.typ

#let conf(
  title: none,
  author: none,
  lang: "en",
  papersize: "us-letter",
  mainfont: "Times New Roman",
  linestretch: 1.5,
  draft: false,
  doc,
) = {
  // Page setup
  set page(
    paper: papersize,
    margin: (
      top: 1in,
      bottom: 1in,
      inside: 1.25in,
      outside: 1in,
    ),
    numbering: "1",
    header: context {
      let page-num = counter(page).get().first()
      if page-num > 1 {
        if calc.odd(page-num) {
          align(right, emph(title))
        } else {
          align(left, emph(author))
        }
      }
    },
  )

  // Font setup
  set text(
    font: mainfont,
    size: 11pt,
    lang: lang,
  )

  set par(
    leading: linestretch * 0.65em,
    first-line-indent: 1.5em,
    justify: true,
  )

  // Heading styles
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(2em)
    align(center, text(size: 18pt, weight: "bold", it.body))
    v(1.5em)
  }

  show heading.where(level: 2): it => {
    v(1.5em)
    align(center, text(size: 14pt, weight: "bold", it.body))
    v(1em)
  }

  // Draft watermark
  if draft {
    place(
      center + horizon,
      rotate(45deg, text(size: 72pt, fill: luma(230), weight: "bold", "DRAFT")),
    )
  }

  doc
}

// Apply the template
#show: doc => conf(
  title: "$title$",
  author: "$if(author)$$author$$else$Author$endif$",
  lang: "$if(lang)$$lang$$else$en$endif$",
  papersize: "$if(papersize)$$papersize$$else$us-letter$endif$",
  mainfont: "$if(mainfont)$$mainfont$$else$Times New Roman$endif$",
  linestretch: $if(linestretch)$$linestretch$$else$1.5$endif$,
  draft: $if(draft)$true$else$false$endif$,
  doc,
)

$body$
