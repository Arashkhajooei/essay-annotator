/* Inter-annotator agreement — pure, DOM-free, network-free (unit-testable).
 *
 * Given an essay's text and each rater's labeled spans, compute:
 *  - token-level agreement (observed + chance-corrected kappa)
 *  - per-label overlap (Jaccard) and per-rater counts
 *  - character-level segments for a visual overlay (agree / conflict / gap)
 *  - a merged list of disagreements (one rater missed a span, or extended it)
 *
 * Inputs:
 *   text          full essay string (offsets index into it)
 *   raters        [{ id, name, color }]
 *   spansByRater  { [raterId]: [{ start, end, label }] }   non-overlapping per rater
 *   labelOrder    [labelName, ...]                          for table ordering
 */

const NONE = 'O'

export function tokenize(text) {
  const toks = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text))) toks.push({ t: m[0], s: m.index, e: m.index + m[0].length })
  return toks
}

/* paragraphs as blank-line separated runs with absolute offsets (matches Annotator) */
export function getParagraphs(text) {
  const out = []
  let idx = 0
  for (const part of text.split(/(\n{2,})/)) {
    if (part.length && !/^\n{2,}$/.test(part)) out.push({ start: idx, end: idx + part.length, text: part })
    idx += part.length
  }
  return out
}

/* label covering [s,e) for one rater's sorted spans, or null. Spans are
 * non-overlapping, so at most one matches. */
function labelForRange(spans, s, e) {
  for (const sp of spans) if (s < sp.end && e > sp.start) return sp.label
  return null
}

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
}

function pairsOf(ids) {
  const out = []
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]])
  return out
}

/* observed pairwise agreement over a set of token indices (treats unlabeled as 'O') */
function observedAgreement(tokLabels, ids, indices) {
  const ps = pairsOf(ids)
  if (!ps.length || !indices.length) return null
  let agree = 0
  let total = 0
  for (const i of indices) {
    for (const [a, b] of ps) {
      total++
      if ((tokLabels[a][i] || NONE) === (tokLabels[b][i] || NONE)) agree++
    }
  }
  return total ? agree / total : null
}

function cohenKappa(tokLabels, a, b, cats, N) {
  if (!N) return null
  let po = 0
  const ca = {}
  const cb = {}
  for (const c of cats) {
    ca[c] = 0
    cb[c] = 0
  }
  for (let i = 0; i < N; i++) {
    const va = tokLabels[a][i] || NONE
    const vb = tokLabels[b][i] || NONE
    if (va === vb) po++
    ca[va]++
    cb[vb]++
  }
  po /= N
  let pe = 0
  for (const c of cats) pe += (ca[c] / N) * (cb[c] / N)
  return Math.abs(1 - pe) < 1e-9 ? (po >= 1 ? 1 : 0) : (po - pe) / (1 - pe)
}

function fleissKappa(tokLabels, ids, cats, N) {
  const n = ids.length
  if (!N || n < 2) return null
  let sumPi = 0
  const catTotals = {}
  for (const c of cats) catTotals[c] = 0
  for (let i = 0; i < N; i++) {
    const counts = {}
    for (const c of cats) counts[c] = 0
    for (const id of ids) counts[tokLabels[id][i] || NONE]++
    let sumSq = 0
    for (const c of cats) {
      sumSq += counts[c] * counts[c]
      catTotals[c] += counts[c]
    }
    sumPi += (sumSq - n) / (n * (n - 1))
  }
  const Pbar = sumPi / N
  let Pe = 0
  for (const c of cats) {
    const pj = catTotals[c] / (N * n)
    Pe += pj * pj
  }
  return Math.abs(1 - Pe) < 1e-9 ? (Pbar >= 1 ? 1 : 0) : (Pbar - Pe) / (1 - Pe)
}

export function computeComparison({ text, raters, spansByRater, labelOrder = [] }) {
  const ids = raters.map((r) => r.id)
  const tokens = tokenize(text)
  const N = tokens.length

  const sorted = {}
  for (const id of ids) sorted[id] = (spansByRater[id] || []).slice().sort((a, b) => a.start - b.start)

  // token → label per rater
  const tokLabels = {}
  for (const id of ids) tokLabels[id] = tokens.map((tk) => labelForRange(sorted[id], tk.s, tk.e))

  // category universe for chance correction
  const catSet = new Set([NONE])
  for (const id of ids) for (const sp of sorted[id]) catSet.add(sp.label)
  for (const l of labelOrder) catSet.add(l)
  const cats = [...catSet]

  const allIdx = tokens.map((_, i) => i)
  const labeledIdx = allIdx.filter((i) => ids.some((id) => tokLabels[id][i]))

  const overall = observedAgreement(tokLabels, ids, allIdx)
  const overallLabeled = observedAgreement(tokLabels, ids, labeledIdx)

  let kappa = null
  let kappaName = null
  if (ids.length === 2) {
    kappa = cohenKappa(tokLabels, ids[0], ids[1], cats, N)
    kappaName = "Cohen's κ"
  } else if (ids.length > 2) {
    kappa = fleissKappa(tokLabels, ids, cats, N)
    kappaName = "Fleiss' κ"
  }

  const pairwise = pairsOf(ids).map(([a, b]) => ({
    a,
    b,
    agreement: observedAgreement(tokLabels, [a, b], allIdx),
  }))

  // per-label: counts per rater + average pairwise Jaccard over tokens
  const labelsPresent = []
  for (const L of labelOrder)
    if (ids.some((id) => tokLabels[id].some((x) => x === L))) labelsPresent.push(L)
  for (const c of cats)
    if (c !== NONE && !labelsPresent.includes(c) && ids.some((id) => tokLabels[id].some((x) => x === c)))
      labelsPresent.push(c)

  const perLabel = labelsPresent.map((L) => {
    const counts = {}
    for (const id of ids) counts[id] = tokLabels[id].filter((x) => x === L).length
    const js = []
    for (const [a, b] of pairsOf(ids)) {
      let inter = 0
      let union = 0
      for (let i = 0; i < N; i++) {
        const xa = tokLabels[a][i] === L
        const xb = tokLabels[b][i] === L
        if (xa && xb) inter++
        if (xa || xb) union++
      }
      if (union > 0) js.push(inter / union)
    }
    return { label: L, counts, jaccard: js.length ? mean(js) : null }
  })

  // character-level segments for the overlay (partition text at every span edge)
  const bounds = new Set([0, text.length])
  for (const id of ids)
    for (const sp of sorted[id]) {
      if (sp.start >= 0 && sp.start <= text.length) bounds.add(sp.start)
      if (sp.end >= 0 && sp.end <= text.length) bounds.add(sp.end)
    }
  const bs = [...bounds].sort((a, b) => a - b)
  const segments = []
  for (let i = 0; i < bs.length - 1; i++) {
    const s = bs[i]
    const e = bs[i + 1]
    if (e <= s) continue
    const perRater = {}
    let labeled = 0
    const labset = new Set()
    for (const id of ids) {
      const lab = labelForRange(sorted[id], s, e)
      perRater[id] = lab
      if (lab) {
        labeled++
        labset.add(lab)
      }
    }
    let state
    if (labeled === 0) state = 'none'
    else if (labeled === ids.length && labset.size === 1) state = 'agree'
    else if (labeled === ids.length) state = 'conflict'
    else state = 'gap'
    segments.push({ s, e, state, perRater, label: labset.size === 1 ? [...labset][0] : null })
  }

  // disagreements: merge adjacent same-signature gap/conflict runs, drop whitespace-only
  const sig = (seg) => ids.map((id) => seg.perRater[id] || '·').join('|')
  const merged = []
  for (const seg of segments) {
    if (seg.state !== 'gap' && seg.state !== 'conflict') continue
    const last = merged[merged.length - 1]
    if (last && last.state === seg.state && last._sig === sig(seg) && last.end === seg.s) {
      last.end = seg.e
    } else {
      merged.push({ start: seg.s, end: seg.e, state: seg.state, perRater: { ...seg.perRater }, _sig: sig(seg) })
    }
  }
  const disagreements = merged
    .map((d) => ({ start: d.start, end: d.end, state: d.state, perRater: d.perRater, text: text.slice(d.start, d.end) }))
    .filter((d) => d.text.trim().length > 0)

  return {
    nTokens: N,
    nLabeledTokens: labeledIdx.length,
    overall,
    overallLabeled,
    kappa,
    kappaName,
    pairwise,
    perLabel,
    segments,
    disagreements,
  }
}
