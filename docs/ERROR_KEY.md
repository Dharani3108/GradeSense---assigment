# Error key — student answer

The submitted answer is the handwritten paper at
[`backend/docs/samples/student-answer-handwritten.pdf`](../backend/docs/samples/student-answer-handwritten.pdf):
three scanned pages, blue ink, cursive, with a circuit diagram on page 1 and a demand-supply graph on
page 3. It has no text layer, so it is read by handwriting recognition (see
[Reading it](#reading-it) below).

The mistakes below are deliberate. They are a mix of correct points, missing points, wrong reasoning
and layout problems, written to be difficult but believable — a student who has memorised the
vocabulary of each topic and attached it to the wrong relationships.

Rubric ids refer to the marking table parsed from the model answer: three questions, five criteria of
one mark each, 15 in total.

---

## Q1 — Science (circuit) — page 1

The whole answer uses the right words in the wrong relationships, which is what makes it a fair test:
a grader that only matches keywords will find "battery", "switch", "series", "parallel", "ammeter",
"voltmeter" and "resistance" all present and award full marks.

| # | What the student wrote | Correct version | Rubric point |
|---|---|---|---|
| 1 | "electricity is **produced by the bulb** and travels through the wires **to the battery**. The battery **stores** electricity" | The battery provides the potential difference that drives current; the bulb is the load that consumes it. The roles are the wrong way round. | q1-c3 |
| 2 | "The switch is used to **increase or decrease the voltage**" | The switch opens or closes the circuit. It does not vary the voltage. | q1-c3 |
| 3 | "When the switch is **open**, the current **can flow** because the circuit is complete" | When the switch is **closed** the path is complete and current flows; when it is open the path is broken and no current flows. | q1-c1 |
| 4 | "The bulb is connected **in parallel** with the battery" | The bulb, resistor, battery, switch and ammeter are connected **in series** in the main loop. | q1-c1 |
| 5 | "The resistor is used to **increase** the current flowing in the circuit" | A resistor **limits** the current. | q1-c3 |
| 6 | "The **ammeter** is connected **in parallel** … the **voltmeter** is connected **in series**" | The ammeter goes **in series** because it measures current through the circuit; the voltmeter goes **in parallel across the bulb** because it measures potential difference across it. Both are reversed. | q1-c2 |
| 7 | "When resistance is **increased**, the current **also increases** because more resistance pushes more electricity through the wire" | With voltage constant, increasing resistance **decreases** current (V = IR). The stated cause and effect runs the wrong way. | q1-c4 |
| 8 | The diagram draws the voltmeter **in the main loop**, in series | The voltmeter belongs across the bulb. The model answer names this exact mistake as substantive. | q1-c2, q1-c5 |

**Correct in Q1:** all six required components are drawn and labelled (battery with + and −, resistor
R, bulb, ammeter A, voltmeter V, switch), and the direction of conventional current is marked — which
is what q1-c5 asks for beyond the wiring.

## Q2 — English (technology and learning) — page 2

This question is answered **well**, deliberately. The model answer's guidance says a student may reach
the opposite conclusion and still earn full marks if the reasoning is developed, so Q2 tests whether
the grader rewards quality of argument rather than similarity to the model answer.

| # | What the student wrote | Rubric point | Assessment |
|---|---|---|---|
| 9 | Takes a clear position: technology is "mostly making students dependent on easily available answers" | q2-c1 | Correct — a clear stance, opposite to the model answer's |
| 10 | Develops it: students "simply search for answers instead of understanding the topic" | q2-c2 | Correct |
| 11 | Raises the opposing view and answers it: "Some people believe technology makes students more intelligent because they have access to much more information … I disagree because having information does not mean that a person understands it" | q2-c3 | Correct — this is the point most students omit |
| 12 | Gives a concrete example: a student searches the exact homework question online and copies the answer, saving time but learning nothing | q2-c4 | Correct |
| 13 | Concludes from the discussion: technology "is not very useful for learning unless students use it carefully" | q2-c5 | Correct |

**If the grader marks Q2 down for disagreeing with the model answer, that is a grading bug, not a
student mistake.**

## Q3 — Economics (demand and supply) — page 3

| # | What the student wrote | Correct version | Rubric point |
|---|---|---|---|
| 14 | "when the price increases, **demand also increases** … therefore both demand and supply curves **upward**" | Demand **falls** as price rises, so the demand curve slopes **downward**. Only supply slopes upward. | q3-c1 |
| 15 | Graph axes: **Quantity on the vertical axis, Price on the horizontal axis** | Quantity on the horizontal axis, price on the vertical axis — the axes are swapped. | q3-c1 |
| 16 | The supply line is drawn **vertical**, and the drawn demand line slopes downward, contradicting the text above it | Supply slopes upward from left to right; the drawing and the explanation must agree. | q3-c1 |
| 17 | "When the price is **below** equilibrium there will be **excess supply** … when price is **above** equilibrium there will be a **shortage**" | Below equilibrium there is a **shortage**; above it there is a **surplus**. The two are swapped. | q3-c3 |
| 18 | "If the cost of production increases, producers will be able to produce **more** goods because they will receive a higher price. Therefore the supply curve will shift to the **right**" | Higher costs make production less profitable at each price, so supply shifts **left/upward**. | q3-c4 |
| 19 | "equilibrium **quantity will increase**" | The new equilibrium has a **higher price and a lower quantity**. | q3-c5 |

**Correct in Q3:** the equilibrium is identified correctly and for the right reason — "The equilibrium
price is ₹30 because at this price the quantity demanded and quantity supplied are both 60" (q3-c2).

## Layout and presentation problems

| # | Problem | Where |
|---|---|---|
| 20 | Pages 1 and 3 are written **sideways** relative to the page, so the scan is rotated 90° | Pages 1, 3 |
| 21 | On page 1 the prose and the circuit diagram run in **different orientations**, so the sheet has to be turned to read both | Page 1 |
| 22 | The graph on page 3 is drawn small and unlabelled on its axis values, with the curves crossing outside the plotted grid | Page 3 |
| 23 | Q3's final paragraph runs off the ruled area at the foot of the page | Page 3 |

---

## Expected shape of the result

Roughly: **Q1 low** (one or two marks at most, mainly for the labelled diagram), **Q2 high** (four or
five), **Q3 one** (the equilibrium). The report should flag the reversals in items 6, 7, 14, 17 and 18
specifically, because each of them uses the exact vocabulary the rubric expects.

> These are the marks the answer *deserves*. This file does not claim what the tool actually returned —
> grading this paper needs handwriting recognition, which needs an API key (below), and that run has
> not been carried out yet. The generated fixture below is what the automated tests assert against.

## Reading it

The paper is a scan, so there is no text to extract locally. GradeSense escalates automatically:

1. A PDF with a text layer is read locally — exact, free, instant.
2. A scan falls through to Cloud Vision if `GOOGLE_APPLICATION_CREDENTIALS` is set.
3. Otherwise to **Gemini**, which reads handwriting using the same `GEMINI_API_KEY` the grader uses,
   and also describes the circuit diagram and the graph in words so the rubric points about the
   drawings can be marked.
4. With neither configured, the report is a flagged zero that says exactly what is missing, rather
   than a guess.

## The generated fixture

[`backend/docs/samples/student-answer.pdf`](../backend/docs/samples/student-answer.pdf) is a separate,
generated paper (`npm run seed:answer`) covering the same kinds of mistake in a PDF **with** a text
layer. It exists so the demo and the test suite run with no API key at all. It scores 4.5 / 15, and
its errors are the ones asserted in `backend/tests/`.
