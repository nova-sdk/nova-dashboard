<template>
    <v-btn size="small">
        Citing {{ galaxyAlias }}/{{ novaAlias }}

        <v-menu activator="parent" :close-on-content-click="false">
            <v-card width="600">
                <v-card-title class="mb-2 px-0"
                    >Citing {{ galaxyAlias }}/{{ novaAlias }}</v-card-title
                >
                <v-card-text class="pa-0">
                    <p class="mb-2">
                        Please do not forget to cite NDIP in any research that uses NOVA or NDIP.
                    </p>

                    <p class="mb-2">
                        When you use NDIP and want to publish your work, please cite this paper:
                    </p>

                    <p>
                        Watson, G.R. et al. (2022).
                        <a href="https://doi.org/10.1093/nar/gkae410"
                            >Calvera: A Platform for the Interpretation and Analysis of Neutron
                            Scattering Data.</a
                        >
                        In: Doug, K., Al, G., Pophale, S., Liu, H., Parete-Koon, S. (eds)
                        Accelerating Science and Engineering Discoveries Through Integrated Research
                        Infrastructure for Experiment, Big Data, Modeling and Simulation. SMC 2022.
                        Communications in Computer and Information Science, vol 1690. Springer,
                        Cham.
                        <a href="https://doi.org/10.1007/978-3-031-23606-8_9"
                            >https://doi.org/10.1007/978-3-031-23606-8_9</a
                        >
                    </p>
                </v-card-text>
            </v-card>
        </v-menu>
    </v-btn>
</template>

<script setup>
const galaxyAlias = import.meta.env.VITE_GALAXY_ALIAS
const novaAlias = import.meta.env.VITE_NOVA_ALIAS
</script>
