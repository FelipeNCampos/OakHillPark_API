import { zodResolver } from "@hookform/resolvers/zod"
import {
  createFileRoute,
  Link as RouterLink,
  redirect,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import type { Body_login_login_access_token as AccessToken } from "@/client"
import { UsersService } from "@/client"
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
import useAuth, { isLoggedIn } from "@/hooks/useAuth"

const formSchema = z.object({
  username: z.email(),
  password: z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
}) satisfies z.ZodType<AccessToken>

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/login")({
  component: Login,
  beforeLoad: async () => {
    if (isLoggedIn()) {
      try {
        await UsersService.readUserMe()
        throw redirect({
          to: "/",
        })
      } catch (_error) {
        localStorage.removeItem("access_token")
      }
    }
  },
  head: () => ({
    meta: [
      {
        title: "Login - OakHill Park",
      },
    ],
  }),
})

function Login() {
  const { loginMutation } = useAuth()
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      username: "",
      password: "",
    },
  })

  const onSubmit = (data: FormData) => {
    if (loginMutation.isPending) return
    loginMutation.mutate(data)
  }

  return (
    <AuthLayoutModal title="Welcome!" description="Access for Condo Managers">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
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
                    data-testid="email-input"
                    placeholder="seu@email.com"
                    type="email"
                    className="rounded border border-[#ddd] px-2.5 pb-2 pt-2.5 transition-all focus-within:border-[#8c7569] text-black"
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
                    data-testid="password-input"
                    placeholder="Password"
                    className="rounded border border-[#ddd] px-2.5 pb-2 pt-2.5 transition-all focus-within:border-[#8c7569] text-black"
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <RouterLink
              to="/recover-password"
              className="text-sm text-[rgba(51,51,51,0.6)] hover:underline"
            >
              Forgot your password?
            </RouterLink>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <RouterLink
                to={"/caretaker-login" as any}
                className="text-sm text-[#8c7569] hover:underline"
              >
                Caretaker login
              </RouterLink>
              <LoadingButton
                type="submit"
                loading={loginMutation.isPending}
                className="w-full cursor-pointer rounded border-0 bg-[#8c7569] px-3 py-2 font-['Nunito',sans-serif] text-white outline-none transition-all duration-300 hover:bg-[#55311c] sm:w-auto"
              >
                Log in
              </LoadingButton>
            </div>
          </div>

          <p className="invisible mt-15 text-center text-sm">
            Don't have an account?{" "}
            <RouterLink to="/signup" className="text-[#8c7569]">
              Sign up now
            </RouterLink>
          </p>
        </form>
      </Form>
    </AuthLayoutModal>
  )
}
