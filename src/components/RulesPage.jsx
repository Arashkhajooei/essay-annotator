import rulesHtml from '../annotationRules.html?raw'

/* The annotation guide is a self-contained styled HTML document (its own light
 * theme, SVGs, CSS). Render it in an isolated iframe so its styles never clash
 * with the app, and it stays pixel-faithful to the source. */
export default function RulesPage() {
  return (
    <iframe
      title="RITA Annotation Rules"
      srcDoc={rulesHtml}
      className="rules-frame"
    />
  )
}
