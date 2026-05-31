export const normalizeApiBase = (value?: string) => {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return ""

  const normalizedValue = trimmedValue.replace(/\/$/, "")
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    normalizedValue.startsWith("http://")
  ) {
    try {
      const upgradedUrl = new URL(normalizedValue)
      upgradedUrl.protocol = "https:"
      return upgradedUrl.toString().replace(/\/$/, "")
    } catch {
      return normalizedValue.replace(/^http:\/\//i, "https://")
    }
  }

  return normalizedValue
}

export const resolveApiBase = (configuredApiUrl?: string) => {
  const normalizedConfiguredApiUrl = normalizeApiBase(configuredApiUrl)
  if (normalizedConfiguredApiUrl) {
    return normalizedConfiguredApiUrl
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8000"
    }

    if (hostname.startsWith("dashboard.")) {
      return `${protocol}//api.${hostname.slice("dashboard.".length)}`
    }

    if (hostname.startsWith("www.")) {
      return `${protocol}//api.${hostname.slice("www.".length)}`
    }

    return `${protocol}//api.${hostname}`
  }

  return "http://localhost:8000"
}
