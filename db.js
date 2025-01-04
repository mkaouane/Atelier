const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { app } = require('electron').remote || require('@electron/remote');
const path = require('path');

// Utiliser le dossier userData pour stocker db.json
const dbPath = path.join(app.getPath('userData'), 'db.json');
const adapter = new FileSync(dbPath);
const db = low(adapter);

// Initialiser la base de données avec une structure par défaut si elle est vide
db.defaults({
    workshopItems: [],
    resourcePrices: {}  // Nouvelle collection pour stocker les prix des ressources
}).write();

module.exports = {
    addItemToWorkshop: (item) => {
        const existingItem = db.get('workshopItems')
            .find({ itemId: item.itemId })
            .value();

        if (!existingItem) {
            db.get('workshopItems')
                .push(item)
                .write();
            return true;
        }
        return false;
    },

    removeItemFromWorkshop: (itemId) => {
        const items = db.get('workshopItems');
        const removed = items.remove({ itemId: itemId }).write();
        console.log('Item retiré:', itemId, removed);
        return removed;
    },

    getWorkshopItems: () => {
        return db.get('workshopItems').value();
    },

    isItemInWorkshop: (itemId) => {
        return db.get('workshopItems')
            .find({ itemId: itemId })
            .value() !== undefined;
    },

    getWorkshopItem: (itemId) => {
        return db.get('workshopItems')
            .find({ itemId: itemId })
            .value();
    },

    updateItemHdvPrice: (itemId, price) => {
        db.get('workshopItems')
            .find({ itemId: itemId })
            .assign({ hdvPrice: price })
            .write();
    },

    updateIngredientPrice: (itemId, ingredientId, price) => {
        // Mettre à jour le prix dans l'item
        const item = db.get('workshopItems')
            .find({ itemId: itemId })
            .value();

        if (item) {
            if (!item.ingredients) {
                item.ingredients = {};
            }
            item.ingredients[ingredientId] = price;

            db.get('workshopItems')
                .find({ itemId: itemId })
                .assign({ ingredients: item.ingredients })
                .write();
        }

        // Stocker/mettre à jour le prix dans la collection resourcePrices
        db.set(`resourcePrices.${ingredientId}`, price).write();
    },

    getResourcePrice: (ingredientId) => {
        return db.get(`resourcePrices.${ingredientId}`).value();
    },

    getDb: () => db
};
