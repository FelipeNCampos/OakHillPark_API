import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  type Body_login_login_access_token as AccessToken,
  LoginService,
  type UserPublic,
  type UserRegister,
  UsersService,
} from "@/client"
import { clearAuthSession, handleError, isAuthSessionError } from "@/utils"
import useCustomToast from "./useCustomToast"

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const readCurrentUser = async () => {
    try {
      return await UsersService.readUserMe()
    } catch (error) {
      if (isAuthSessionError(error)) {
        clearAuthSession()
        return null
      }
      throw error
    }
  }

  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: readCurrentUser,
    enabled: isLoggedIn(),
    retry: false,
  })

  const signUpMutation = useMutation({
    mutationFn: (data: UserRegister) =>
      UsersService.registerUser({ requestBody: data }),
    onSuccess: () => {
      navigate({ to: "/login" })
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  const login = async (data: AccessToken) => {
    const response = await LoginService.loginAccessToken({
      formData: data,
    })
    localStorage.setItem("access_token", response.access_token)
    let userData: UserPublic
    try {
      userData = await UsersService.readUserMe()
    } catch (error) {
      if (isAuthSessionError(error)) {
        clearAuthSession()
        throw new Error("Session expired, please log in again.")
      }
      throw error
    }

    if ((userData.cargo ?? 0) < 1 && !userData.is_superuser) {
      clearAuthSession()
      throw new Error("Access denied.")
    }

    return userData
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async (userData) => {
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      if (userData.is_superuser) {
        navigate({ to: "/admin" })
      } else if ((userData.cargo ?? 0) >= 2) {
        navigate({ to: "/dashboard" })
      } else if ((userData.cargo ?? 0) === 1) {
        navigate({ to: "/caretaker-tasks" as any })
      } else {
        navigate({ to: "/" })
      }
    },
    onError: handleError.bind(showErrorToast),
  })

  const logout = () => {
    clearAuthSession()
    navigate({ to: "/login" })
  }

  return {
    signUpMutation,
    loginMutation,
    logout,
    user,
  }
}

export { isLoggedIn }
export default useAuth
