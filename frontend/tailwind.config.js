/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sky: {
          DEFAULT: "#5DA8DE",
          deep: "#3B8FC9",
          soft: "#E8F4FC",
          mist: "#F3F9FD",
        },
        ink: {
          DEFAULT: "#1A1F2C",
          soft: "#5A6578",
          faint: "#8B95A8",
        },
        clay: {
          DEFAULT: "#D64545",
          mist: "#FDECEC",
        },
        sun: {
          DEFAULT: "#C98A1A",
          mist: "#FFF6E5",
        },
        pine: {
          DEFAULT: "#2F9E6B",
          mist: "#E7F7EF",
        },
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
        xl4: "2rem",
      },
      boxShadow: {
        card:
          "0 12px 32px rgba(26, 31, 44, 0.08), 0 4px 10px rgba(26, 31, 44, 0.04)",
        float:
          "0 14px 32px rgba(93, 168, 222, 0.22), 0 4px 10px rgba(26, 31, 44, 0.06)",
        soft:
          "0 6px 18px rgba(26, 31, 44, 0.06)",
        pop:
          "0 20px 44px rgba(93, 168, 222, 0.2), 0 8px 16px rgba(26, 31, 44, 0.08)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(22px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-8px) rotate(0.4deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.94)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.55" },
          "50%": { transform: "scale(1.08)", opacity: "0.85" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-up-1": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both",
        "fade-up-2": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both",
        "fade-up-3": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.24s both",
        "fade-up-4": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.32s both",
        "fade-in": "fade-in 0.6s ease both",
        float: "float 5.5s ease-in-out infinite",
        "float-slow": "float-slow 7s ease-in-out infinite",
        shimmer: "shimmer 8s ease infinite",
        "scale-in": "scale-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-soft": "pulse-soft 3.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
