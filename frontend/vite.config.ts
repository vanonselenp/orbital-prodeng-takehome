import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	optimizeDeps: {
		// mermaid destabilizes Vite's dep optimizer through streamdown's lazy diagram bundle.
		exclude: ["mermaid"],
	},
	server: {
		port: 5173,
		host: "0.0.0.0",
		proxy: {
			"/api": {
				target: "http://backend:8000",
				changeOrigin: true,
			},
		},
	},
});
