import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { OpenAPI } from "./client"
import { ThemeProvider } from "./components/theme-provider"
import { Toaster } from "./components/ui/sonner"
import "./index.css"
import { routeTree } from "./routeTree.gen"
import { clearAuthSession, isAuthSessionError } from "./utils"

const normalizeApiBase = (value?: string) => {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return ""
  return trimmedValue.replace(/\/$/, "")
}

const resolveApiBase = () => {
  const configuredApiUrl = normalizeApiBase(import.meta.env.VITE_API_URL)
  if (configuredApiUrl) {
    return configuredApiUrl
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

OpenAPI.BASE = resolveApiBase()
OpenAPI.TOKEN = async () => {
  return localStorage.getItem("access_token") || ""
}

const handleApiError = (error: Error) => {
  if (isAuthSessionError(error)) {
    clearAuthSession()
    if (window.location.pathname !== "/login") {
      window.location.href = "/login"
    }
  }
}
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleApiError,
  }),
  mutationCache: new MutationCache({
    onError: handleApiError,
  }),
})

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
