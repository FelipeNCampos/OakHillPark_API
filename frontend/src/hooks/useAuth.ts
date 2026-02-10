import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import {
  type Body_login_login_access_token as AccessToken,
  LoginService,
  type UserPublic,
  type UserRegister,
  UsersService,
} from "@/client"
import { handleError } from "@/utils"
import useCustomToast from "./useCustomToast"

const isLoggedIn = () => {
  return localStorage.getItem("access_token") !== null
}

const useAuth = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()

  const { data: user } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoggedIn(),
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
    // Fetch user data immediately after login
    const userData = await UsersService.readUserMe()

    // Verify user has permission to login (cargo >= 1 or is_superuser)
    if ((userData.cargo ?? 0) < 1 && !userData.is_superuser) {
      localStorage.removeItem("access_token")
      throw new Error(
        "Acesso negado. Apenas gerentes e administradores podem acessar.",
      )
    }

    return userData
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async (userData) => {
      // Invalida o cache de usuário atual para forçar refetch
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      // Redireciona baseado no tipo de usuário
      // is_superuser = admin -> vai para /admin
      // cargo >= 1 = gerente -> vai para /dashboard
      if (userData.is_superuser) {
        // Admin - go to admin page
        navigate({ to: "/admin" })
      } else if ((userData.cargo ?? 0) >= 1) {
        // Manager - go to dashboard
        navigate({ to: "/dashboard" })
      } else {
        // Should not happen due to validation above
        navigate({ to: "/" })
      }
    },
    onError: handleError.bind(showErrorToast),
  })

  const logout = () => {
    localStorage.removeItem("access_token")
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
