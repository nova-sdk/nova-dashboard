/**
 * Mocks GET /api/vuetify_config/ (src/vue/src/main.js), fetched once before the Vue app
 * is even created. The app only reads response.theme, so this is a minimal static stand-in
 * for the real payload (served in prod by the `nova-trame` pip package's bundled theme JSON).
 */
export async function mockVuetifyConfig(page) {
    await page.route("**/api/vuetify_config/", async (route) => {
        await route.fulfill({
            json: {
                theme: {
                    defaultTheme: "light",
                    themes: {
                        light: {
                            dark: false,
                            colors: {
                                primary: "#1976D2",
                                secondary: "#424242",
                                error: "#B00020",
                                warning: "#FB8C00",
                                success: "#4CAF50"
                            }
                        },
                        dark: {
                            dark: true,
                            colors: {
                                primary: "#2196F3",
                                secondary: "#616161",
                                error: "#CF6679",
                                warning: "#FFB74D",
                                success: "#66BB6A"
                            }
                        }
                    }
                }
            }
        })
    })
}
