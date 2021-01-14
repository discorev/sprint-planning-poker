class Player {
    name;
    choice;
    snoozed = false;
    constructor(name) {
        this.name = name;
        this.choice = null;
    }
};

module.exports = Player;
