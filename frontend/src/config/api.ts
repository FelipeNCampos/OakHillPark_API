export const normalizeApiBase = (value?: string) => {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return ""

  const normalizedValue = trimmedValue.replace(/\/$/, "")
  try {
    const parsedUrl = new URL(normalizedValue)
    const isLocalhost =
      parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "::1"

    if (parsedUrl.protocol === "http:" && !isLocalhost) {
      parsedUrl.protocol = "https:"
    }

    return parsedUrl.toString().replace(/\/$/, "")
  } catch {
    if (/^http:\/\//i.test(normalizedValue)) {
      return normalizedValue.replace(/^http:\/\//i, "https://")
    }

    return normalizedValue
  }

  return normalizedValue
}

export const enforceHttpsUrl = (value: string) => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return trimmedValue

  try {
    const parsedUrl = new URL(trimmedValue)
    const isLocalhost =
      parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname === "::1"

    if (parsedUrl.protocol === "http:" && !isLocalhost) {
      parsedUrl.protocol = "https:"
      return parsedUrl.toString().replace(/\/$/, "")
    }

    return parsedUrl.toString().replace(/\/$/, "")
  } catch {
    return /^http:\/\//i.test(trimmedValue)
      ? trimmedValue.replace(/^http:\/\//i, "https://")
      : trimmedValue
  }
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
