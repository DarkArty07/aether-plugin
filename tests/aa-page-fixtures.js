'use strict'

// A model block of a model page, in the shape of the page's embedded JSON, and a page that holds some blocks (the page also embeds the
// models it compares). The quotes are escaped, as in the page. The block carries an intelligence figure too: the refresh must ignore it.
const block = (slug, f) => `{"slug":"${slug}","name":"Model ${slug}","shortName":"Model ${slug}","scalars":{"intelligenceIndex":${f.intelligence},"terminalBench40":${f.code}},"intelligenceIndexCostPerTask":{"cost":{"total":${f.cost}}},"evals":[{"slug":"terminalbench-4-0","score":${f.code},"outputTokensPerTask":1000.5,"costPerTask":${f.codeCost},"timePerTask":${f.seconds}}],"briefcaseBreakdown":{"overall":{"elo":1100,"lower95ci":1,"upper95ci":2},"rubricPassRate":0.3,"analyticalQuality":{"elo":1200,"lower95ci":1,"upper95ci":2},"presentation":{"elo":990}}}`
const page = (...blocks) => `<html><body><script>self.__next_f.push([1,"${blocks.join(',').replace(/"/g, '\\"')}"])</script></body></html>`
module.exports = { block, page }
