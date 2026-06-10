import { useRef, useState } from 'react'
import { readTextFiles } from '../lib/textImport.js'
import { toast } from '../lib/toast.js'

/**
 * Click-or-drop zone for plain-text essay files.
 * One file  -> onSingle({title, text})   (fills the form for review)
 * Many files -> onMany([{title, text}])  (bulk import)
 */
export default function TxtUpload({ onSingle, onMany }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handle(fileList) {
    setBusy(true)
    try {
      const files = await readTextFiles(fileList)
      if (!files.length) {
        toast('No text files found — use .txt files', 'error')
        return
      }
      const empty = files.filter((f) => !f.text)
      if (empty.length) {
        toast(`Skipped ${empty.length} empty file${empty.length === 1 ? '' : 's'}`, 'error')
      }
      const ok = files.filter((f) => f.text)
      if (!ok.length) return
      if (ok.length === 1) {
        onSingle(ok[0])
        toast(`Loaded “${ok[0].name}” — review and save`)
      } else {
        await onMany(ok)
      }
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div
      className={`txt-drop ${drag ? 'drag' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handle(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.text,.md,text/plain"
        multiple
        hidden
        onChange={(e) => handle(e.target.files)}
      />
      {busy
        ? 'Reading…'
        : 'Upload .txt files — click or drag them here. One file fills the form below; several files import one essay each.'}
    </div>
  )
}
