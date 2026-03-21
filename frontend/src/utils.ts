import { AxiosError } from "axios"
import { ApiError } from "./client"

function getErrorDetail(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) {
    return undefined
  }

  const errDetail = (err.body as any)?.detail
  if (Array.isArray(errDetail) && errDetail.length > 0) {
    return errDetail[0]?.msg
  }

  return typeof errDetail === "string" ? errDetail : undefined
}

function extractErrorMessage(err: Error | ApiError): string {
  if (err instanceof AxiosError) {
    return err.message
  }

  const errDetail = getErrorDetail(err)
  if (errDetail) {
    return errDetail
  }

  return err.message || "Something went wrong."
}

export const handleError = function (
  this: (msg: string) => void,
  err: Error | ApiError,
) {
  const errorMessage = extractErrorMessage(err)
  this(errorMessage)
}

export const clearAuthSession = () => {
  localStorage.removeItem("access_token")
}

export const isAuthSessionError = (err: unknown): err is ApiError => {
  if (!(err instanceof ApiError)) {
    return false
  }

  if ([401, 403].includes(err.status)) {
    return true
  }

  return err.status === 404 && getErrorDetail(err) === "User not found"
}

export const getInitials = (name: string): string => {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
}
