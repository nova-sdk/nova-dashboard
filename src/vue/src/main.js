/*
 * This is the entrypoint for our application. We create the Vue app with our desired plugins and mount it into the DOM.
 */

import { createApp } from "vue"
import { createPinia } from "pinia"
import { createVuetify } from "vuetify"
import { aliases, mdi } from "vuetify/iconsets/mdi"
import "vuetify/styles"
import "@mdi/font/css/materialdesignicons.css"

import App from "@/App.vue"
import initRouter from "@/router"
import "@/assets/core_style.scss"

const basePath = import.meta.env.VITE_BASE_PATH

fetch(`${basePath}api/vuetify_config.json`)
    .then((response) => response.json())
    .then(async (config) => {
        const app = createApp(App)

        app.use(createPinia()) // Pinia is a store library for Vue 3 that operates in a similar fashion to how we use view_models in Trame
        app.use(
            createVuetify({
                icons: {
                    aliases,
                    defaultSet: "mdi",
                    sets: { mdi }
                },
                defaults: {
                    global: {
                        hideDetails: "auto",
                        hideSpinButtons: true,
                        persistentPlaceholder: true
                    },
                    VAlert: {
                        color: "secondary"
                    },
                    VAppBar: {
                        color: "primary",
                        VBtn: {
                            color: false
                        }
                    },
                    VBadge: {
                        color: "secondary"
                    },
                    VBtn: {
                        color: "primary"
                    },
                    VBtnToggle: {
                        color: "primary",
                        VBtn: {
                            class: "border-primary border-sm"
                        }
                    },
                    VCard: {
                        class: "pa-4",
                        VCard: {
                            class: "border-primary border-sm pa-4",
                            style: {
                                "background-color": "rgba(var(--v-theme-primary), 0.1)"
                            }
                        },
                        VCardSubtitle: {
                            style: {
                                "white-space": "normal"
                            }
                        },
                        VCardTitle: {
                            style: {
                                "line-height": 1.2,
                                "white-space": "normal"
                            }
                        },
                        VListItem: {
                            class: "border-primary border-sm",
                            style: {
                                "background-color": "rgba(var(--v-theme-primary), 0.1)"
                            }
                        }
                    },
                    VCardSubtitle: {
                        opacity: 0.8
                    },
                    VCheckbox: {
                        color: "primary"
                    },
                    VChip: {
                        color: "primary"
                    },
                    VDivider: {
                        color: "primary"
                    },
                    VExpansionPanels: {
                        color: "primary"
                    },
                    VFileInput: {
                        color: "primary",
                        prependIcon: false
                    },
                    VLabel: {
                        style: {
                            opacity: 1.0
                        }
                    },
                    VList: {
                        VListItemAction: {
                            VBtn: {
                                class: "ml-2"
                            },
                            VProgressCircular: {
                                class: "ml-2"
                            }
                        }
                    },
                    VListItem: {
                        VBtn: {
                            color: "secondary"
                        }
                    },
                    VListItemSubtitle: {
                        opacity: 0.8
                    },
                    VProgressCircular: {
                        color: "secondary"
                    },
                    VProgressLinear: {
                        color: "secondary"
                    },
                    VRadioGroup: {
                        color: "primary"
                    },
                    VSelect: {
                        color: "primary"
                    },
                    VSlider: {
                        color: "primary"
                    },
                    VSnackbar: {
                        color: "primary",
                        VBtn: {
                            color: false
                        }
                    },
                    VSwitch: {
                        color: "primary"
                    },
                    VTextarea: {
                        color: "primary"
                    },
                    VTextField: {
                        color: "primary"
                    },
                    VWindowItem: {
                        reverseTransition: "fade-transition",
                        transition: "fade-transition"
                    }
                },
                theme: config.theme
            })
        )
        app.use(await initRouter())

        app.mount("#app")
    })
