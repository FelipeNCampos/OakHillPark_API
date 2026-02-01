import { useEffect, useState } from "react"

interface AuthLayoutModalProps {
  children: React.ReactNode
  title: string
  description: string
  imageUrl?: string
}

export function AuthLayoutModal({
  children,
  title,
  description,
  imageUrl = "/assets/images/unsplash.jpg",
}: AuthLayoutModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(true)

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > window.innerHeight / 3 && !isOpen) {
        setIsOpen(true)
        setShowScrollDown(false)
        document.body.style.overflow = "hidden"
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => {
      window.removeEventListener("scroll", handleScroll)
      document.body.style.overflow = "initial"
    }
  }, [isOpen])

  const handleClose = () => {
    setIsOpen(false)
    document.body.style.overflow = "initial"
  }

  const handleOpenClick = () => {
    setIsOpen(true)
    setShowScrollDown(false)
    document.body.style.overflow = "hidden"
  }

  return (
    <>
      {/* Background container with scroll */}
      <div
        className="h-[200vh] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/assets/images/background.jpg)" }}
      />

      {/* Scroll down indicator */}
      {showScrollDown && (
        <div className="fixed left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center text-center text-[#7d695e]">
          <div className="text-[32px] font-extrabold">SCROLL DOWN</div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            className="mt-2 h-12 w-12"
          >
            <path
              fill="currentColor"
              d="M16 3C8.832031 3 3 8.832031 3 16s5.832031 13 13 13 13-5.832031 13-13S23.167969 3 16 3zm0 2c6.085938 0 11 4.914063 11 11 0 6.085938-4.914062 11-11 11-6.085937 0-11-4.914062-11-11C5 9.914063 9.914063 5 16 5zm-1 4v10.28125l-4-4-1.40625 1.4375L16 23.125l6.40625-6.40625L21 15.28125l-4 4V9z"
            />
          </svg>
        </div>
      )}

      {/* Modal overlay */}
      <div
        className={`fixed bottom-0 left-0 flex w-full flex-col items-center justify-center transition-all duration-[400ms] ${
          isOpen
            ? "h-full bg-[rgba(51,51,51,0.85)]"
            : "h-[60px] bg-[rgba(51,51,51,0.5)]"
        }`}
      >
        {/* Modal container */}
        <div
          className={`absolute flex w-full max-w-[720px] overflow-hidden rounded-[10px] bg-white transition-all ${
            isOpen
              ? "pointer-events-auto scale-100 translate-y-0 opacity-100 duration-[600ms]"
              : "pointer-events-none scale-[0.4] translate-y-[100px] opacity-0 duration-[300ms]"
          }`}
        >
          {/* Left side - Form */}
          <div
            className={`flex-[1.5] bg-white px-[30px] pb-5 pt-[60px] transition-all duration-500 ${
              isOpen
                ? "translate-y-0 opacity-100 delay-100"
                : "translate-y-[80px] opacity-0"
            }`}
          >
            <h1 className="m-0 text-[26px] font-normal text-[#55311c]">
              {title}
            </h1>
            <p className="mb-[30px] mt-[6px] text-[rgba(0,0,0,0.7)]">
              {description}
            </p>
            {children}
          </div>

          {/* Right side - Image */}
          <div className="flex-[2] overflow-hidden transition-all duration-300">
            <img
              src={imageUrl}
              alt="Login background"
              className={`h-full w-full object-cover transition-all duration-[1200ms] ${
                isOpen ? "scale-100" : "scale-[2]"
              }`}
            />
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute right-[10px] top-[12px] h-8 w-8 cursor-pointer border-0 bg-transparent p-0 outline-0"
            type="button"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
              <path d="M 25 3 C 12.86158 3 3 12.86158 3 25 C 3 37.13842 12.86158 47 25 47 C 37.13842 47 47 37.13842 47 25 C 47 12.86158 37.13842 3 25 3 z M 25 5 C 36.05754 5 45 13.94246 45 25 C 45 36.05754 36.05754 45 25 45 C 13.94246 45 5 36.05754 5 25 C 5 13.94246 13.94246 5 25 5 z M 16.990234 15.990234 A 1.0001 1.0001 0 0 0 16.292969 17.707031 L 23.585938 25 L 16.292969 32.292969 A 1.0001 1.0001 0 1 0 17.707031 33.707031 L 25 26.414062 L 32.292969 33.707031 A 1.0001 1.0001 0 1 0 33.707031 32.292969 L 26.414062 25 L 33.707031 17.707031 A 1.0001 1.0001 0 0 0 32.980469 15.990234 A 1.0001 1.0001 0 0 0 32.292969 16.292969 L 25 23.585938 L 17.707031 16.292969 A 1.0001 1.0001 0 0 0 16.990234 15.990234 z" />
            </svg>
          </button>
        </div>

        {/* Open modal button */}
        {!isOpen && (
          <button
            onClick={handleOpenClick}
            className="cursor-pointer rounded-[30px] border-0 bg-white px-10 py-[10px] font-['Nunito',sans-serif] text-[18px] text-[#7d695e] shadow-[0_10px_40px_rgba(0,0,0,0.16)] outline-0 transition-all duration-300 hover:border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.8)]"
            type="button"
          >
            Click here to login
          </button>
        )}
      </div>
    </>
  )
}
