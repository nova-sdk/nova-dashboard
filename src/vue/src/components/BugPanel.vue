<template>
    <v-btn size="small">
        Report Issue

        <v-menu activator="parent" :close-on-content-click="false">
            <v-card width="600">
                <v-card-title class="mb-2 px-0">Report Issue</v-card-title>
                <v-card-text class="pa-0">
                    <p class="mb-4">
                        You can view existing tickets at
                        <a :href="ticketUrl" target="_blank">{{ ticketUrl }}</a
                        >.
                    </p>

                    <div class="issue-form">
                        <div class="d-flex flex-row ga-1">
                            <v-text-field
                                v-model="email"
                                :maxlength="textFieldMaxLength"
                                label="Email Address"
                            />
                            <v-text-field
                                v-model="name"
                                :maxlength="textFieldMaxLength"
                                label="Name"
                            />
                        </div>
                        <v-select v-model="subject" :items="subjects" label="Subject">
                            <template v-slot:item="data">
                                <v-list-item
                                    v-bind="data.props"
                                    class="bg-transparent"
                                ></v-list-item>
                            </template>
                        </v-select>
                        <v-textarea
                            v-model="description"
                            :maxlength="descriptionMaxLength"
                            label="Please Describe Your Issue"
                            rows="5"
                            auto-grow
                            counter
                            outlined
                        />
                    </div>

                    <v-btn v-if="!submitting" :disabled="isDisabled" class="mb-4" @click="submit">
                        Submit
                    </v-btn>
                    <v-progress-circular v-else-if="submitting" indeterminate />

                    <p v-if="issueUrl">
                        Issue was opened successfully. We will be in touch soon. You may view your
                        opened issue at
                        <a :href="issueUrl" target="_blank">{{ issueUrl }}</a
                        >.
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
const ticketUrl = import.meta.env.VITE_TICKET_URL
const subjects = ["Login Issue", "Problem Starting a Tool", "Problem Using a Tool", "Other"]
const user = useUserStore()

const email = ref("")
const name = ref("")
const subject = ref("")
const description = ref("")
const submitting = ref(false)
const issueUrl = ref("")
const errorMessage = ref("")
const textFieldMaxLength = 100
const descriptionMaxLength = 500
const submissionTimeout = 1000 // one second

const isDisabled = computed(
    () => !email.value || !name.value || !subject.value || !description.value
)

function reset() {
    setDefaultEmail()
    subject.value = ""
    description.value = ""
    submitting.value = false
}

function setDefaultEmail() {
    if (user.is_logged_in) {
        email.value = user.email
    }
}

async function submit() {
    issueUrl.value = ""
    errorMessage.value = ""
    submitting.value = true

    const response = await fetch(`${basePath}api/issue/`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": Cookies.get("csrftoken")
        },
        body: JSON.stringify({
            email: email.value.slice(0, textFieldMaxLength),
            subject: subject.value,
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
    } else {
        issueUrl.value = ""
        errorMessage.value = "Something went wrong while submitting your issue. Please try again."
    }

    reset()
}

defineExpose({ setDefaultEmail })
</script>

<style scoped>
.issue-form > * {
    margin-bottom: 0.5em;
}
</style>
