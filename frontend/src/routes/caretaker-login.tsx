import { zodResolver } from "@hookform/resolvers/zod"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { OpenAPI, UsersService } from "@/client"
import { enforceHttpsUrl, resolveApiBase } from "@/config/api"
import { AuthLayoutModal } from "@/components/Common/AuthLayoutModal"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import { PasswordInput } from "@/components/ui/password-input"
import { isLoggedIn } from "@/hooks/useAuth"
import useCustomToast from "@/hooks/useCustomToast"
import { clearAuthSession, isAuthSessionError } from "@/utils"

const formSchema = z.object({
  username: z.email(),
  password: z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
})

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/caretaker-login" as any)({
  component: CaretakerLogin,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      let current: Awaited<ReturnType<typeof UsersService.readUserMe>> | null =
        null
      try {
        current = await UsersService.readUserMe()
      } catch {
        clearAuthSession()
        return
      }
      if (current.cargo === 1 && !current.is_superuser) {
        throw redirect({ to: "/caretaker-tasks" as any })
      }
      throw redirect({ to: "/" })
    }
  },
  head: () => ({
    meta: [
      {
        title: "Caretaker Login - OakHill Park",
      },
    ],
  }),
})

function CaretakerLogin() {
  const { showErrorToast } = useCustomToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  async function submit(data: FormData) {
    setIsSubmitting(true)
    try {
      const body = new URLSearchParams()
      body.set("username", data.username)
      body.set("password", data.password)
      const base = enforceHttpsUrl(resolveApiBase(OpenAPI.BASE))
      const response = await fetch(
        `${base}/api/v1/login/caretaker-access-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        },
      )

      if (!response.ok) {
        let message = "Login failed"
        try {
          const payload = (await response.json()) as { detail?: string }
          message = payload.detail || message
        } catch {
          // ignore parse errors
        }
        throw new Error(message)
      }

      const tokenPayload = (await response.json()) as { access_token: string }
      localStorage.setItem("access_token", tokenPayload.access_token)

      let me
      try {
        me = await UsersService.readUserMe()
      } catch (error) {
        if (isAuthSessionError(error)) {
          clearAuthSession()
          throw new Error("Session expired, please log in again.")
        }
        throw error
      }
      if (me.cargo !== 1 || me.is_superuser) {
        clearAuthSession()
        throw new Error("Account is not a caretaker account.")
      }
      window.location.href = "/caretaker-tasks"
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : "Login failed")
      setIsSubmitting(false)
      return
    }
  }

  return (
    <AuthLayoutModal
      title="Caretaker"
      description="Exclusive access for caretakers"
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(submit)}
          className="flex flex-col gap-4"
        >
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#8c7569]">
                  Email
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="caretaker@email.com"
                    type="email"
                    className="rounded border border-[#ddd] px-2.5 pb-2 pt-2.5 text-black transition-all focus-within:border-[#8c7569]"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#8c7569]">
                  Password
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    placeholder="Password"
                    className="rounded border border-[#ddd] px-2.5 pb-2 pt-2.5 text-black transition-all focus-within:border-[#8c7569]"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <div className="mt-2 flex justify-end">
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              className="w-full cursor-pointer rounded border-0 bg-[#8c7569] px-3 py-2 font-['Nunito',sans-serif] text-white outline-none transition-all duration-300 hover:bg-[#55311c] sm:w-auto"
            >
              Log in as Caretaker
            </LoadingButton>
          </div>
        </form>
      </Form>
    </AuthLayoutModal>
  )
}
