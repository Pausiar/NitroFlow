// Mock for electron-store
class Store {
  private data: Record<string, unknown> = {}
  get(key: string, defaultValue?: unknown) {
    return this.data[key] ?? defaultValue
  }
  set(key: string, value: unknown) {
    this.data[key] = value
  }
  has(key: string) {
    return key in this.data
  }
  delete(key: string) {
    delete this.data[key]
  }
  clear() {
    this.data = {}
  }
}
module.exports = Store
