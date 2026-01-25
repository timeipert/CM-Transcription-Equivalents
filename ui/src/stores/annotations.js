import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useAnnotationsStore = defineStore('annotations', () => {
    // Key: "Source_Folio_Pattern" -> [{ points: "x,y x,y", color: "red" }]
    const annotations = ref({})

    // Load
    const stored = localStorage.getItem('annotations')
    if (stored) {
        try {
            annotations.value = JSON.parse(stored)
        } catch (e) {
            console.error("Error loading annotations", e)
        }
    }

    // Save
    watch(annotations, () => {
        localStorage.setItem('annotations', JSON.stringify(annotations.value))
    }, { deep: true })

    function getAnnotations(source, folio, pattern) {
        const key = `${source}_${folio}_${pattern}`
        return annotations.value[key] || []
    }

    function addAnnotation(source, folio, pattern, points) {
        const key = `${source}_${folio}_${pattern}`
        if (!annotations.value[key]) annotations.value[key] = []

        annotations.value[key].push({
            points, // "10,10 50,50 ..." (relative %)
            id: Date.now()
        })
    }

    function removeAnnotation(source, folio, pattern, id) {
        const key = `${source}_${folio}_${pattern}`
        if (!annotations.value[key]) return
        annotations.value[key] = annotations.value[key].filter(a => a.id !== id)
    }

    return {
        annotations,
        getAnnotations,
        addAnnotation,
        removeAnnotation
    }
})
