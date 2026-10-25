# Rhyme or Pop!

A live multiplayer rhyming game set at the Witchlight Carnival. Everyone floats up from a patchwork teapot inside a bubble. A word appears, and players take turns rhyming with it. Every real rhyme lifts your bubble higher. Say a real word that doesn't rhyme, or run out of time, and your bubble **pops**. The last bubble in the sky wins.

**Play it:** https://ashtabletop.com/witchlight-rhyme-game/

## How to play

1. Open the link and pick a name and an icon, then press **Float in!**
2. The first player to join is the host. The host picks a starting word (or leaves it empty for a surprise) and a timer, then starts the game.
3. On your turn, type a word (or up to four words) that rhymes with the starting word, like **toilet** and **boil it**.
4. Every word must be a real English word. A made-up word is not accepted, but it does not cost you your turn.
5. You can't repeat an answer, and you can't use something that sounds exactly like the starting word.
6. A real word that doesn't rhyme, or running out of time, pops your bubble.

To run a separate table for another group, add `?room=name` to the link, for example `.../witchlight-rhyme-game/?room=thursday`.

## How it works

- `core.js` is the rhyme engine and the game rules. Rhymes are judged by sound, not spelling, using a pronouncing dictionary. Two answers rhyme when their sounds match from the last stressed vowel to the end, and the sounds before that vowel differ. Unstressed vowels are treated loosely so phrases like "boil it" rhyme with "toilet".
- `dict.txt` is the word list (about 68,000 real English words with pronunciations, with offensive words removed). Rebuild it with `tools/build-dict.mjs`.
- Every screen replays the same ordered list of events (join, start, say, fail, reset) stored in a Firebase Realtime Database, so everyone sees the same game at the same time. The timer uses the server's clock.
- Run the checks with `node tools/test-core.mjs`.

### Database rules

The game only needs write access to its own area, and only accepts well-formed events that can be added (never edited or deleted):

```json
"rhymeRooms": {
  "$room": {
    ".read": true,
    "events": {
      "$k": {
        ".write": "$room.matches(/^[a-z0-9-]{1,24}$/) && !data.exists()",
        ".validate": "newData.hasChildren(['t','ts','by'])",
        "t": { ".validate": "newData.isString() && newData.val().matches(/^(join|leave|start|say|fail|reset)$/)" },
        "by": { ".validate": "newData.isString() && newData.val().length >= 4 && newData.val().length <= 16" },
        "pid": { ".validate": "newData.isString() && newData.val().length >= 4 && newData.val().length <= 16" },
        "ts": { ".validate": "newData.val() === now" },
        "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 16" },
        "emoji": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 12" },
        "text": { ".validate": "newData.isString() && newData.val().length <= 60" },
        "seed": { ".validate": "newData.isString() && newData.val().length <= 24" },
        "secs": { ".validate": "newData.isNumber() && newData.val() >= 10 && newData.val() <= 90" },
        "idx": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() < 10000" },
        "reason": { ".validate": "newData.isString() && newData.val().length <= 12" },
        "$other": { ".validate": false }
      }
    },
    "$other": { ".validate": false }
  }
}
```

## Credits and licenses

The pronunciations come from the [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict), copyright Carnegie Mellon University (license in `CMUDICT-LICENSE.txt`). Real-word checking uses [dwyl/english-words](https://github.com/dwyl/english-words), and offensive words are filtered with the [LDNOOBW list](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words).
