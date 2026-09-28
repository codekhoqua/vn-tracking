/**
 * 🐾 VN Pet System - Legacy Compatibility Shim
 * Redirects legacy PetRoamEngine calls to Pet3DEngine.
 * Completely removes old 2D pet GIF elements.
 */

(function() {
    // Clean up any old 2D pet GIF elements from cache or legacy DOM
    function cleanLegacy2DPet() {
        document.querySelectorAll('img[src*="/static/img/pet/"], img[src*="2.gif"], img[src*="1.gif"], img[src*="3.gif"], img[src*="4.gif"], img[src*="5.gif"]').forEach(img => {
            img.remove();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanLegacy2DPet);
    } else {
        cleanLegacy2DPet();
    }

    window.PetRoamEngine = {
        init: function(data) {
            cleanLegacy2DPet();
            if (window.Pet3DEngine) window.Pet3DEngine.init(data);
        },
        syncPet: function(pet) {
            cleanLegacy2DPet();
            if (window.Pet3DEngine) window.Pet3DEngine.syncPet(pet);
        },
        syncPets: function(pets) {
            cleanLegacy2DPet();
            if (Array.isArray(pets) && pets.length > 0) {
                if (window.Pet3DEngine) window.Pet3DEngine.syncPet(pets[0]);
            } else if (pets && window.Pet3DEngine) {
                window.Pet3DEngine.syncPet(pets);
            }
        },
        setDancing: function(isDancing) {
            if (window.Pet3DEngine) window.Pet3DEngine.setDancing(isDancing);
        },
        triggerPetFeedAnimation: function() {
            if (window.Pet3DEngine) window.Pet3DEngine.feed();
        },
        destroy: function() {
            cleanLegacy2DPet();
            if (window.Pet3DEngine) window.Pet3DEngine.destroy();
        }
    };

    window.triggerPetFeedAnimation = function() {
        if (window.Pet3DEngine) window.Pet3DEngine.feed();
    };
})();
