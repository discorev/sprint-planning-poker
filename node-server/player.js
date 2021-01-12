class Player {
    name;
    choice;
    snooze = false;
    constructor(name) {
        this.name = name;
        this.choice = null;
    }
};

module.exports = Player;
