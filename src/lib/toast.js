// Tiny pub/sub toast bus — no context plumbing needed.
let listeners = []
let nextId = 1

export function toast(message, type = 'info') {
  const t = { id: nextId++, message, type }
  listeners.forEach((fn) => fn(t))
}

export function onToast(fn) {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}
