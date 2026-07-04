import daisyui from "daisyui";
var config = {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {},
    },
    plugins: [daisyui],
    daisyui: {
        themes: ["light", "cupcake", "emerald", "corporate", "night"],
    },
};
export default config;
