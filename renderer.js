const axios = require('axios');
const db = require('./db');
const { getDb } = require('./db');

const ITEMS_PER_PAGE = 9;
let currentSearch = '';
let isWorkshopView = false;
let currentItem;
let currentItems = [];

// Copier le texte dans le presse-papier
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        console.log('Texte copié:', text);
    } catch (err) {
        console.error('Erreur lors de la copie:', err);
    }
}

// Rendre la fonction accessible depuis le HTML
window.copyToClipboard = copyToClipboard;

// Charger les items initiaux ou selon la recherche
async function loadItems(searchTerm = '') {
    try {
        loadingIndicator.style.display = 'block';
        
        if (isWorkshopView) {
            const items = db.getWorkshopItems();
            displayWorkshopItems(items);
        } else {
            let url = `https://api.dofusdb.fr/items?$limit=${ITEMS_PER_PAGE}`;
            if (searchTerm) {
                url += `&name.fr[$regex]=${searchTerm}&name.fr[$options]=i`;
            }

            const response = await axios.get(url);
            console.log(`Chargé ${response.data.data.length} items`);
            
            currentItems = response.data.data;
            displayItems(currentItems);
        }
        
        loadingIndicator.style.display = 'none';
    } catch (error) {
        console.error('Erreur lors du chargement des items:', error);
        loadingIndicator.style.display = 'none';
    }
}

// Afficher les items de l'atelier
async function displayWorkshopItems(items) {
    console.log('Items à afficher:', items);
    if (!Array.isArray(items)) {
        console.error('Items n\'est pas un tableau:', items);
        items = [];
    }

    workshopItems.innerHTML = '';
    
    for (const item of items) {
        try {
            console.log('Traitement de l\'item:', item);
            const recipe = await getItemRecipe(item.itemId);
            console.log('Recette récupérée:', recipe);
            
            const profit = calculateProfit(item, recipe);
            const bestPrice = getBestPrice(item, recipe);
            
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            
            let profitHtml = '';
            if (profit !== null) {
                const profitClass = profit > 0 ? 'profit' : 'loss';
                const icon = profit > 0 ? '💰' : '🛠️';
                profitHtml = `
                    <div class="profit-indicator ${profitClass}" title="${Math.abs(profit).toLocaleString()} kamas ${profit > 0 ? 'de profit' : 'de perte'}">
                        ${icon}
                    </div>
                    <div class="profit-details">
                        ${profit > 0 ? '+' : '-'}${Math.abs(profit).toLocaleString()} kamas
                    </div>
                    <div class="profit-details">
                        Meilleur prix : ${bestPrice.toLocaleString()} kamas
                    </div>
                `;
            }
            
            itemCard.innerHTML = `
                <img src="https://api.dofusdb.fr/img/items/${item.iconId}.png" alt="${item.name}">
                <h3>${item.name}</h3>
                <p>Level ${item.level || 'N/A'}</p>
                ${profitHtml}
                <div class="workshop-actions">
                    <button class="workshop-btn remove" onclick="removeItemFromWorkshop(${item.itemId})">
                        Retirer
                    </button>
                </div>
            `;
            
            itemCard.onclick = (e) => {
                if (!e.target.matches('button')) {
                    const fullItem = {
                        id: item.itemId,
                        name: { fr: item.name },
                        level: item.level,
                        iconId: item.iconId,
                        type: { name: { fr: item.type } }
                    };
                    showItemDetails(fullItem);
                }
            };
            
            workshopItems.appendChild(itemCard);
        } catch (error) {
            console.error('Erreur lors de l\'affichage de l\'item:', error, 'Item:', item);
        }
    }
    
    // Mettre à jour le total
    await updateWorkshopTotal(items);
}

// Afficher les items de la recherche
function displayItems(items) {
    itemsList.innerHTML = '';
    items.forEach(item => {
        itemsList.appendChild(createItemCard(item));
    });
}

// Créer une carte d'item
function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card';
    
    const isInWorkshop = db.isItemInWorkshop(item.id);
    const buttonClass = isInWorkshop ? 'remove' : 'add';
    const buttonText = isInWorkshop ? 'Retirer' : 'Ajouter';
    const buttonAction = isInWorkshop 
        ? `removeItemFromWorkshop('${item.id}')`
        : `addItemToWorkshop(${JSON.stringify(item).replace(/"/g, '&quot;')})`;
    
    card.innerHTML = `
        <img src="https://api.dofusdb.fr/img/items/${item.iconId}.png" alt="${item.name.fr}">
        <h3>${item.name.fr}</h3>
        <p>Level ${item.level || 'N/A'}</p>
        <button class="workshop-btn ${buttonClass}" onclick="event.stopPropagation(); ${buttonAction}">
            ${buttonText}
        </button>
    `;
    
    card.onclick = () => showItemDetails(item);
    
    return card;
}

// Récupérer la recette d'un item
async function getItemRecipe(itemId) {
    try {
        const response = await axios.get(`https://api.dofusdb.fr/recipes/${itemId}`);
        console.log(response);
        return response.data;
    } catch (error) {
        console.error(`Erreur lors du chargement de la recette pour l'item ${itemId}:`, error);
        return null;
    }
}

// Calculer le prix total des ressources pour un item
function calculateTotalResourcesPrice(recipe, workshopItem) {
    console.log('Calcul du prix total des ressources pour l\'item:', workshopItem);
    if (!recipe || !recipe.ingredients || !workshopItem) {
        console.log('Données manquantes pour le calcul:', { recipe, workshopItem });
        return 0;
    }
    
    const total = recipe.ingredients.reduce((total, ingredient, index) => {
        const quantity = recipe.quantities[index];
        const price = workshopItem.ingredients?.[ingredient.id] || db.getResourcePrice(ingredient.id) || 0;
        console.log('Prix calculé pour', ingredient.name?.fr, ':', price, 'x', quantity);
        return total + (price * quantity);
    }, 0);

    console.log('Prix total calculé:', total);
    return total;
}

// Calculer le profit pour un item
function calculateProfit(item, recipe) {
    console.log('Calcul du profit pour l\'item:', item);
    if (!item?.hdvPrice || !recipe || !recipe.ingredients || !item.ingredients) return null;
    
    const totalResourcesPrice = recipe.ingredients.reduce((total, ingredient, index) => {
        const quantity = recipe.quantities[index];
        const price = item.ingredients[ingredient.id] || 0;
        return total + (price * quantity);
    }, 0);
    
    return item.hdvPrice - totalResourcesPrice;
}

// Calculer le meilleur prix pour un item (HDV ou ressources)
function getBestPrice(item, recipe) {
    console.log('Calcul du meilleur prix pour l\'item:', item);
    if (!item?.hdvPrice || !recipe) return 0;
    
    const totalResourcesPrice = recipe.ingredients.reduce((total, ingredient, index) => {
        const quantity = recipe.quantities[index];
        const price = item.ingredients[ingredient.id] || 0;
        return total + (price * quantity);
    }, 0);
    
    // Si pas de prix HDV ou si le prix des ressources est plus avantageux
    return totalResourcesPrice > 0 ? Math.min(item.hdvPrice, totalResourcesPrice) : item.hdvPrice;
}

// Mettre à jour le total de l'atelier
async function updateWorkshopTotal(items) {
    console.log('Mise à jour du total de l\'atelier:', items);
    const totalElement = document.querySelector('.workshop-total .total-amount');
    let total = 0;
    
    for (const item of items) {
        const recipe = await getItemRecipe(item.itemId);
        total += getBestPrice(item, recipe);
    }
    
    totalElement.textContent = `${total.toLocaleString()} kamas`;
}

// Afficher les détails d'un item
async function showItemDetails(item) {
    console.log('Affichage des détails de l\'item:', item);
    currentItem = item;
    const modal = document.getElementById('itemModal');
    const itemDetails = document.getElementById('itemDetails');

    try {
        const isInWorkshopItem = db.isItemInWorkshop(item.id);
        const workshopItem = isInWorkshopItem ? db.getWorkshopItem(item.id) : null;
        
        // Afficher d'abord les informations de base
        itemDetails.innerHTML = `
            <div class="modal-header">
                <img src="https://api.dofusdb.fr/img/items/${item.iconId}.png" alt="${item.name.fr}">
                <h2>${item.name.fr}</h2>
                ${isInWorkshopItem ? `
                    <div class="hdv-price">
                        <label>Prix HDV:</label>
                        <input type="number" 
                            id="hdvPrice" 
                            value="${workshopItem?.hdvPrice || ''}" 
                            onchange="updateHdvPrice(${item.id}, this.value)"
                            onkeydown="if(event.key === 'Enter') { this.blur(); updateHdvPrice(${item.id}, this.value); }"
                            placeholder="Prix de vente">
                    </div>
                ` : ''}
                <button class="workshop-btn ${isInWorkshopItem ? 'remove' : 'add'}" 
                    onclick="${isInWorkshopItem ? 
                        `removeItemFromWorkshop(${item.id})` : 
                        `addItemToWorkshop(${JSON.stringify(item).replace(/"/g, '&quot;')})`}">
                    ${isInWorkshopItem ? 'Retirer' : 'Ajouter à l\'atelier'}
                </button>
            </div>
            <div class="modal-body">
                <p>Level ${item.level || 'N/A'}</p>
                <p>Type: ${item.type.name.fr}</p>
                <div id="recipeContainer">
                    <p class="loading-text">Chargement de la recette...</p>
                </div>
            </div>
        `;

        modal.style.display = 'block';

        // Charger la recette
        const recipe = await getItemRecipe(item.id);
        const recipeContainer = document.getElementById('recipeContainer');
        
        if (recipe && recipe.ingredients && recipe.quantities) {
            let recipeHtml = '<div class="recipe-content">';
            
            // Si l'item est dans l'atelier et a un prix HDV, afficher la comparaison
            if (isInWorkshopItem && workshopItem?.hdvPrice) {
                const totalResourcesPrice = calculateTotalResourcesPrice(recipe, workshopItem);
                const profit = workshopItem.hdvPrice - totalResourcesPrice;
                
                recipeHtml += `
                    <div class="price-comparison">
                        <div class="total-price">
                            <span>Prix des ressources: ${totalResourcesPrice.toLocaleString()} kamas</span>
                            <span>Prix HDV: ${workshopItem.hdvPrice.toLocaleString()} kamas</span>
                            <span>Différence: ${Math.abs(profit).toLocaleString()} kamas ${profit > 0 ? '(Profit)' : '(Perte)'}</span>
                        </div>
                        <div class="comparison-icon ${profit > 0 ? 'profit' : 'loss'}">
                            ${profit > 0 ? '💰' : '🛠️'}
                        </div>
                    </div>
                `;
            }

            recipeHtml += '<div class="recipe-header">';
            recipeHtml += '<h3>Recette:</h3>';
            
            // Si l'item est dans l'atelier, calculer et afficher le total des ressources
            if (isInWorkshopItem) {
                const totalResourcesPrice = calculateTotalResourcesPrice(recipe, workshopItem);
                recipeHtml += `<span class="total-resources">Total: ${totalResourcesPrice.toLocaleString()} kamas</span>`;
            }
            
            recipeHtml += '</div><ul class="recipe-list">';

            recipe.ingredients.forEach((ingredient, index) => {
                const quantity = recipe.quantities[index];
                // Chercher d'abord dans les ingrédients de l'item, sinon dans les prix globaux
                let ingredientPrice = workshopItem?.ingredients?.[ingredient.id];
                if (ingredientPrice === undefined) {
                    ingredientPrice = db.getResourcePrice(ingredient.id) || '';
                }
                const totalPrice = ingredientPrice ? (ingredientPrice * quantity) : '';
                
                recipeHtml += `
                    <li>
                        <div class="item-info">
                            <img src="${ingredient.img}" alt="${ingredient.name.fr}">
                            <div class="item-name">
                                ${quantity}x ${ingredient.name.fr}
                                <button class="copy-btn" onclick="copyToClipboard('${ingredient.name.fr}')" title="Copier le nom">
                                    📋
                                </button>
                            </div>
                        </div>
                        ${isInWorkshopItem ? `
                            <div class="price-input">
                                <input type="number" 
                                    value="${ingredientPrice}" 
                                    onchange="updateIngredientPrice(${item.id}, ${ingredient.id}, this.value)"
                                    onkeydown="if(event.key === 'Enter') { this.blur(); updateIngredientPrice(${item.id}, ${ingredient.id}, this.value); }"
                                    placeholder="Prix unitaire">
                                ${totalPrice ? `<span class="total-price">${totalPrice.toLocaleString()} kamas</span>` : ''}
                            </div>
                        ` : ''}
                    </li>
                `;
            });

            recipeHtml += '</ul></div>';
            recipeContainer.innerHTML = recipeHtml;
        } else {
            recipeContainer.innerHTML = '<p>Aucune recette disponible pour cet item.</p>';
        }
    } catch (error) {
        console.error('Erreur lors de l\'affichage des détails:', error);
        itemDetails.innerHTML = '<p>Erreur lors du chargement des détails.</p>';
    }
}

// Mettre à jour le prix HDV d'un item
function updateHdvPrice(itemId, price) {
    console.log('Mise à jour du prix HDV:', itemId, price);
    if (price) {
        db.updateItemHdvPrice(itemId, parseInt(price));
        showItemDetails(currentItem);
        // Rafraîchir l'affichage des cartes
        const allItems = db.getWorkshopItems();
        console.log('Items après mise à jour HDV:', allItems);
        displayWorkshopItems(allItems);
    }
}

// Mettre à jour le prix d'un ingrédient
function updateIngredientPrice(itemId, ingredientId, price) {
    console.log('Mise à jour du prix ingrédient:', itemId, ingredientId, price);
    if (price) {
        db.updateIngredientPrice(itemId, ingredientId, parseInt(price));
        showItemDetails(currentItem);
        // Rafraîchir l'affichage des cartes
        const allItems = db.getWorkshopItems();
        console.log('Items après mise à jour ingrédient:', allItems);
        displayWorkshopItems(allItems);
    }
}

// Ajouter un item à l'atelier
function addItemToWorkshop(item) {
    console.log('Ajout de l\'item à l\'atelier:', item);
    const workshopItem = {
        itemId: item.id,
        name: item.name.fr,
        level: item.level || 0,
        iconId: item.iconId,
        type: item.type.name.fr,
        addedAt: new Date().toISOString()
    };
    
    if (db.addItemToWorkshop(workshopItem)) {
        const items = db.getWorkshopItems();
        displayWorkshopItems(items);
        displayItems(currentItems); // Rafraîchir la liste des items pour mettre à jour les boutons
    }
}

// Retirer un item de l'atelier
function removeItemFromWorkshop(itemId) {
    console.log('Retrait de l\'item de l\'atelier:', itemId);
    try {
        db.removeItemFromWorkshop(itemId);
        const items = db.getWorkshopItems() || [];
        
        if (isWorkshopView) {
            displayWorkshopItems(items);
        } else {
            displayItems(currentItems);
        }
        
        // Si la modal est ouverte, la mettre à jour
        if (currentItem && currentItem.id === itemId) {
            showItemDetails(currentItem);
        }
    } catch (error) {
        console.error('Erreur lors du retrait de l\'item:', error);
    }
}

// Définir removeItemFromWorkshop comme global pour qu'il soit accessible depuis le HTML
window.removeItemFromWorkshop = removeItemFromWorkshop;

// Retirer un item de l'atelier (appelé depuis le HTML)
window.removeFromWorkshop = function(itemId) {
    console.log('Retrait de l\'item de l\'atelier (appelé depuis le HTML):', itemId);
    try {
        db.removeItemFromWorkshop(itemId);
        const items = db.getWorkshopItems() || [];
        
        if (isWorkshopView) {
            displayWorkshopItems(items);
        } else {
            displayItems(currentItems);
        }
        
        // Si la modal est ouverte, la mettre à jour
        if (currentItem && currentItem.id === itemId) {
            showItemDetails(currentItem);
        }
    } catch (error) {
        console.error('Erreur lors du retrait de l\'item:', error);
    }
};

// Variables globales pour les éléments DOM
const searchInput = document.getElementById('searchInput');
const itemsList = document.getElementById('itemsList');
const loadingIndicator = document.getElementById('loadingIndicator');
const workshopItems = document.getElementById('workshopItems');
const searchView = document.getElementById('searchView');
const workshopView = document.getElementById('workshopView');
const viewToggle = document.getElementById('view-toggle');

// Changer de vue (atelier/recherche)
viewToggle.onclick = () => {
    console.log('Changement de vue:', isWorkshopView);
    isWorkshopView = !isWorkshopView;
    viewToggle.textContent = isWorkshopView ? 'Voir tout les items' : 'Voir l\'atelier';
    
    if (isWorkshopView) {
        searchView.style.display = 'none';
        workshopView.style.display = 'block';
        const items = db.getWorkshopItems();
        displayWorkshopItems(items);
    } else {
        searchView.style.display = 'block';
        workshopView.style.display = 'none';
        displayItems(currentItems);
    }
};

// Fermer le modal
const closeBtn = document.querySelector('.close');
closeBtn.onclick = () => {
    console.log('Fermeture du modal');
    itemModal.style.display = 'none';
};

// Fermer le modal en cliquant en dehors
window.onclick = (event) => {
    console.log('Clic en dehors du modal');
    if (event.target === itemModal) {
        itemModal.style.display = 'none';
    }
};

// Recherche d'items avec debounce
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    console.log('Recherche d\'items:', e.target.value);
    const searchTerm = e.target.value.trim();
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
        if (searchTerm !== currentSearch) {
            currentSearch = searchTerm;
            loadItems(searchTerm);
        }
    }, 300);
});

// Gestion du thème
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'dark';
const root = document.documentElement;
root.setAttribute('data-theme', savedTheme);
updateThemeButton();

function updateThemeButton() {
    console.log('Mise à jour du bouton de thème');
    const currentTheme = root.getAttribute('data-theme');
    themeToggle.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
}

themeToggle.addEventListener('click', () => {
    console.log('Changement de thème');
    const currentTheme = root.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButton();
});

// Charger les items initiaux
loadItems();
