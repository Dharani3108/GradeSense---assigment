import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Generates the sample student answer used for demos and tests.
 *
 * The answer is deliberately imperfect: it mixes fully correct points with
 * missing points, reversed reasoning, misspellings and layout problems, exactly
 * as described in docs/ERROR_KEY.md. It is written as a real PDF text layer so
 * the tool can grade it without a cloud OCR account.
 */

const PAGE = { width: 595.28, height: 841.89 }
const LEFT = 64
const RIGHT = 545
const RULE_SPACING = 21
const BODY_SIZE = 10.5

type Block =
  | { kind: 'heading'; text: string; indent?: number }
  | { kind: 'para'; text: string; indent?: number; overflow?: boolean; tight?: boolean }
  | { kind: 'gap'; size: number }
  | { kind: 'break' }

const PAGE_ONE: Block[] = [
  { kind: 'heading', text: 'Q1. Science' },
  {
    kind: 'para',
    text: 'A simple electric circuit is a closed path which allows the electric curent to flow through it. The battery gives the potentiel difference which pushes the current around the circuit. The switch is used to open and close the circuit. When the switch is closed the path is complete and the current flows through the bulb and the resistor, and when the switch is open the circuit is broken so no current flows.',
  },
  { kind: 'gap', size: 6 },
  {
    kind: 'para',
    text: 'The battery, switch, resistor, bulb and ammeter are all joined one after another in series in the main circuit. The ammeter is placed in series because it has to measure the current going through the circuit. The voltmeeter is also connected in series with the bulb so that it can measure the voltage of the bulb.',
  },
  { kind: 'gap', size: 6 },
  {
    // Deliberate layout fault: this paragraph is indented out of line with the rest.
    kind: 'para',
    indent: 46,
    text: 'If the resistence of the circuit is increased then the current in the circuit will also increase, because a bigger resistance pushes more current through the wires.',
  },
  { kind: 'gap', size: 4 },
  { kind: 'para', indent: 46, text: '(diagram drawn on the rough sheet)' },
  { kind: 'gap', size: 16 },

  // Deliberate layout fault: the heading is pushed into the middle of the page.
  { kind: 'heading', text: 'Q2. English', indent: 168 },
  {
    kind: 'para',
    text: 'I think technology has made students better learners. Today a student can find any information in a few seconds on the internet and there are many videos and websites which explain difficult topics in a simple way. For example if a student does not understand a science concept in the class, he can watch a video at home and learn it again at his own speed.',
  },
  { kind: 'gap', size: 6 },
  {
    // Deliberate layout fault: this line runs past the right margin.
    kind: 'para',
    overflow: true,
    text: 'Technology also saves a lot of time for the students and it is much easier than going to a library. So technology is good for learning.',
  },
]

const PAGE_TWO: Block[] = [
  { kind: 'heading', text: 'Q3. Economics' },
  {
    kind: 'para',
    text: 'The graph is drawn with the price on the horizontal axis and the quantity on the vertical axis. The demand line goes down from left to right and the supply line goes up, and the two lines cut each other at one point.',
  },
  { kind: 'gap', size: 6 },
  {
    kind: 'para',
    text: 'The equilibrum point is at the price of Rs 30 and the quantity is 60 units, because at this price the quantity demanded and the quantity supplied are equal to each other.',
  },
  { kind: 'gap', size: 6 },
  {
    kind: 'para',
    text: 'When the price is below the equilibrum price there is a surpluss in the market, because the sellers have more goods than the buyers want to buy at that price.',
  },
  { kind: 'gap', size: 6 },
  {
    // Deliberate layout fault: cramped line spacing for the last answer.
    kind: 'para',
    tight: true,
    text: 'If the cost of production increases the producers will supply more, so the supply curve will shift to the right on the graph.',
  },
]

function wrap(text: string, width: number, widthOf: (value: string) => number) {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (widthOf(candidate) > width && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

async function build() {
  const document = await PDFDocument.create()
  document.setTitle('GradeSense sample student answer')
  document.setAuthor('Aarav Mehta')
  const body = await document.embedFont(StandardFonts.TimesRoman)
  const heading = await document.embedFont(StandardFonts.TimesRomanBold)

  const newPage = (withHeader: boolean) => {
    const page = document.addPage([PAGE.width, PAGE.height])
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: rgb(0.996, 0.992, 0.98) })
    // Ruled lines and a red margin, so the output looks like an answer sheet.
    for (let y = PAGE.height - 96; y > 56; y -= RULE_SPACING) {
      page.drawLine({ start: { x: 48, y }, end: { x: RIGHT + 8, y }, thickness: 0.4, color: rgb(0.83, 0.88, 0.93) })
    }
    page.drawLine({ start: { x: LEFT - 12, y: PAGE.height - 40 }, end: { x: LEFT - 12, y: 44 }, thickness: 0.7, color: rgb(0.92, 0.78, 0.78) })
    let cursor = PAGE.height - 64
    if (withHeader) {
      page.drawText('Name: Aarav Mehta          Class: X-B          Roll No: 27', { x: LEFT, y: cursor, size: 10, font: body, color: rgb(0.2, 0.2, 0.24) })
      cursor -= 18
      page.drawText('GradeSense Examination - Answer Sheet', { x: LEFT, y: cursor, size: 12, font: heading, color: rgb(0.12, 0.12, 0.16) })
      cursor -= 26
    }
    return { page, cursor }
  }

  const render = (blocks: Block[], withHeader: boolean) => {
    const { page, cursor: start } = newPage(withHeader)
    let cursor = start
    const ink = rgb(0.13, 0.16, 0.32)

    for (const block of blocks) {
      if (block.kind === 'gap') { cursor -= block.size; continue }
      if (block.kind === 'break') { cursor -= RULE_SPACING; continue }
      if (block.kind === 'heading') {
        cursor -= 6
        page.drawText(block.text, { x: LEFT + (block.indent ?? 0), y: cursor, size: 12, font: heading, color: ink })
        cursor -= 20
        continue
      }
      const indent = block.indent ?? 0
      const lineHeight = block.tight ? BODY_SIZE + 2.5 : BODY_SIZE + 6.5
      const usable = (block.overflow ? RIGHT + 34 : RIGHT) - (LEFT + indent)
      const lines = wrap(block.text, usable, value => body.widthOfTextAtSize(value, BODY_SIZE))
      for (const line of lines) {
        page.drawText(line, { x: LEFT + indent, y: cursor, size: BODY_SIZE, font: body, color: ink })
        cursor -= lineHeight
      }
    }
  }

  render(PAGE_ONE, true)
  render(PAGE_TWO, false)

  const target = resolve(process.cwd(), 'docs/samples/student-answer.pdf')
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await document.save())
  console.log(`Wrote ${target}`)
}

await build()
