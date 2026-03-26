<template>
    <v-btn size="small">
        Report Issue

        <v-menu activator="parent" :close-on-content-click="false" open-on-hover>
            <v-card width="600">
                <v-card-title class="mb-2 px-0">Report Issue</v-card-title>
                <v-card-text class="pa-0">
                    <p>All fields are required.</p>

                    <div class="issue-form">
                        <v-text-field
                            v-model="email"
                            :maxlength="textFieldMaxLength"
                            label="Email Address"
                        />
                        <v-text-field
                            v-model="name"
                            :maxlength="textFieldMaxLength"
                            label="Full Name"
                        />
                        <v-text-field
                            v-model="title"
                            :maxlength="textFieldMaxLength"
                            label="Subject"
                        />
                        <v-textarea
                            v-model="description"
                            :maxlength="descriptionMaxLength"
                            label="Please Describe Your Issue"
                            rows="1"
                            auto-grow
                            counter
                            outlined
                        />
                    </div>

                    <v-btn v-if="!submitting && !submitted" :disabled="isDisabled" @click="submit">
                        Submit
                    </v-btn>
                    <v-progress-circular v-else-if="submitting" indeterminate />

                    <p v-if="issueUrl">
                        Issue was opened successfully. We will be in touch soon. You may view your
                        opened issue at
                        <a :href="issueUrl" target="_blank">{{ issueUrl }}</a
                        >. If you need to submit another issue, then please refresh this page.
                    </p>
                    <p v-if="errorMessage">
                        {{ errorMessage }}
                    </p>
                </v-card-text>
            </v-card>
        </v-menu>
    </v-btn>
</template>

<script setup>
import Cookies from "js-cookie"
import { computed, ref } from "vue"
import { useUserStore } from "@/stores/user"

const basePath = import.meta.env.VITE_BASE_PATH
const user = useUserStore()

const email = ref("")
const name = ref("")
const title = ref("")
const description = ref("")
const submitting = ref(false)
const submitted = ref(false)
const issueUrl = ref("")
const errorMessage = ref("")
const textFieldMaxLength = 100
const descriptionMaxLength = 500
const submissionTimeout = 1000 // one second

const isDisabled = computed(() => !email.value || !name.value || !title.value || !description.value)

function setDefaultEmail() {
    if (user.is_logged_in) {
        email.value = user.email
    }
}

async function submit() {
    submitting.value = true

    const response = await fetch(`${basePath}api/issue/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": Cookies.get("csrftoken")
        },
        body: JSON.stringify({
            email: email.value.slice(0, textFieldMaxLength),
            name: name.value.slice(0, textFieldMaxLength),
            title: title.value.slice(0, textFieldMaxLength),
            description: description.value.slice(0, descriptionMaxLength)
        })
    })

    setTimeout(() => {
        postSubmit(response)
    }, submissionTimeout)
}

async function postSubmit(response) {
    if (response.status === 200) {
        const data = await response.json()

        issueUrl.value = data.url
        errorMessage.value = ""
        submitted.value = true
    } else {
        issueUrl.value = ""
        errorMessage.value = "Something went wrong while submitting your issue. Please try again."
    }

    submitting.value = false
}

defineExpose({ setDefaultEmail })
</script>

<style scoped>
.issue-form > * {
    margin-bottom: 0.5em;
}
</style>
