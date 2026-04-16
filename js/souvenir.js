import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// Fonction pour formater les dates
function formatDate(dateString) {
    if (!dateString) return '';
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('fr-FR', options);
}

// Mappage des traits avec leurs icônes
const PERSONALITY_TRAITS = {
    'Généreux': '🎁',
    'Courageux': '🦁',  
    'Bienveillant': '💚',
    'Passionné': '🔥',
    'Sage': '🦉',
    'Drôle': '😄',
    'Créatif': '🎨',
    'Déterminé': '💪'
};

async function loadMemorialData() {
    const urlParams = new URLSearchParams(window.location.search);
    const souvenirId = urlParams.get('id');
    
    if (!souvenirId) {
        showError('Aucun mémorial trouvé', 'Veuillez vérifier que le lien est correct.');
        return;
    }

    try {
        const docRef = doc(db, "souvenirs", souvenirId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            populateMemorialPage(data);
        } else {
            showError('Mémorial introuvable', 'Ce mémorial n\'existe pas ou a été supprimé.');
        }
    } catch (error) {
        console.error("Erreur lors du chargement du mémorial: ", error);
        showError('Erreur de chargement', 'Une erreur est survenue lors du chargement du mémorial.');
    }
}

function showError(title, message) {
    document.querySelector('.preview-container').innerHTML = `
        <div style="text-align: center; padding: 60px 40px;">
            <h1>${title}</h1>
            <p>${message}</p>
        </div>
    `;
}

function populateMemorialPage(data) {
    document.title = `Mémorial de ${data.name}`;
    
    console.log('Données du mémorial:', data);

    // Appliquer le thème et la typographie au rendu final
    document.body.classList.remove('theme-sage','theme-nocturne','font-serif','font-sans');
    if (data.theme === 'sage') {
        document.body.classList.add('theme-sage');
    } else if (data.theme === 'nocturne') {
        document.body.classList.add('theme-nocturne');
    }
    if (data.typography === 'serif') {
        document.body.classList.add('font-serif');
    } else {
        document.body.classList.add('font-sans');
    }

    // 1. Header avec nom, dates et citation
    const nameElement = document.getElementById('preview-name');
    const datesElement = document.getElementById('preview-dates');
    const quoteElement = document.getElementById('preview-quote');
    
    nameElement.textContent = data.name || 'Nom non renseigné';
    
    if (data.birthdate && data.deathdate) {
        datesElement.textContent = `${formatDate(data.birthdate)} - ${formatDate(data.deathdate)}`;
    } else {
        datesElement.textContent = 'Dates non renseignées';
    }
    
    if (data.quote && data.quote.trim()) {
        quoteElement.textContent = `"${data.quote}"`;
        quoteElement.style.display = 'block';
    } else {
        quoteElement.style.display = 'none';
    }

    // 2. Biographie
    const biographyElement = document.getElementById('preview-biography');
    if (data.message) {
        biographyElement.textContent = data.message;
    } else {
        biographyElement.textContent = 'Aucune biographie renseignée.';
    }

    // 3. Galerie de photos
    const photosGrid = document.getElementById('photos-grid');
    const photosSection = document.getElementById('photos-section');
    
    const allPhotos = [];
    if (data.coverImageURL) allPhotos.push(data.coverImageURL);
    if (data.photoURLs && Array.isArray(data.photoURLs)) {
        data.photoURLs.forEach(url => {
            if (url && url !== '') allPhotos.push(url);
        });
    }
    
    if (allPhotos.length > 0) {
        photosSection.style.display = 'block';
        photosGrid.innerHTML = '';
        
        allPhotos.forEach((url, index) => {
            const photoPreview = document.createElement('div');
            photoPreview.className = 'photo-preview';
            
            const img = document.createElement('img');
            img.src = url;
            img.alt = `Photo ${index + 1}`;
            img.loading = 'lazy';
            
            const overlay = document.createElement('div');
            overlay.className = 'photo-overlay';
            
            photoPreview.appendChild(img);
            photoPreview.appendChild(overlay);
            photosGrid.appendChild(photoPreview);
        });
    } else {
        photosSection.style.display = 'none';
    }

    // 4. Traits de personnalité
    const traitsContainer = document.getElementById('traits-container');
    const personalitySection = document.getElementById('personality-section');
    
    if (data.selectedTraits && Array.isArray(data.selectedTraits) && data.selectedTraits.length > 0) {
        personalitySection.style.display = 'block';
        traitsContainer.innerHTML = '';
        
        data.selectedTraits.forEach(trait => {
            const traitBadge = document.createElement('div');
            traitBadge.className = 'trait-badge';
            
            const icon = PERSONALITY_TRAITS[trait] || '✨';
            traitBadge.innerHTML = `<span>${icon}</span> ${trait}`;
            
            traitsContainer.appendChild(traitBadge);
        });
    } else {
        personalitySection.style.display = 'none';
    }

    // 5. Anecdote
    const anecdoteContent = document.getElementById('anecdote-content');
    const anecdoteSection = document.getElementById('anecdote-section');
    
    if (data.anecdote) {
        anecdoteSection.style.display = 'block';
        anecdoteContent.textContent = data.anecdote;
    } else {
        anecdoteSection.style.display = 'none';
    }

    // 6. Lieu de naissance
    const birthLocation = document.getElementById('birth-location');
    const locationSection = document.getElementById('location-section');
    
    if (data.birthplace) {
        locationSection.style.display = 'block';
        birthLocation.textContent = data.birthplace;
    } else {
        locationSection.style.display = 'none';
    }

    // 7. Vidéos
    const videosList = document.getElementById('videos-list');
    const videosSection = document.getElementById('videos-section');
    
    const allVideos = [];
    if (data.videoURL && data.videoURL !== 'video-placeholder') allVideos.push(data.videoURL);
    if (data.videoURLs && Array.isArray(data.videoURLs)) {
        data.videoURLs.forEach(url => {
            if (url && url !== 'video-placeholder') allVideos.push(url);
        });
    }
    
    if (allVideos.length > 0) {
        videosSection.style.display = 'block';
        videosList.innerHTML = '';
        
        allVideos.forEach((url, index) => {
            const mediaItem = document.createElement('div');
            mediaItem.className = 'media-item';
            
            mediaItem.innerHTML = `
                <div class="media-icon">🎥</div>
                <div class="media-info">
                    <h4>Vidéo ${index + 1}</h4>
                    <p><a href="${url}" target="_blank" style="color: var(--color-primary);">Voir la vidéo</a></p>
                </div>
            `;
            
            videosList.appendChild(mediaItem);
        });
    } else {
        videosSection.style.display = 'none';
    }
}

// Initialisation de la page au chargement
document.addEventListener('DOMContentLoaded', loadMemorialData);
