/* ============================================================
   Beanie Baby Reference Database
   Curated data for ~125 popular Ty Beanie Babies.
   Users can add their own entries (stored in localStorage,
   synced to Firestore when signed in).

   Fields per entry:
   - name        : display name
   - year        : year introduced
   - birthday    : date of birth on tag
   - style       : Ty style number
   - poem        : tag poem (may be blank — fill from physical tag)
   - retired     : retirement date (if known)
   - notes       : collector notes, rarities, errors

   The first ~60 entries (through Claude tie-dye) are the v0.1.0
   seed set with poems transcribed.   The v0.6.0 expansion below
   adds another ~65 entries focused on factual data (year, style,
   retirement, value-affecting variations); poems left blank for
   the user to fill from their actual physical tag, which is the
   canonical source anyway.
   ============================================================ */

const BEANIE_DB = [
  {
    name: "Princess",
    year: 1997,
    birthday: "",
    style: "4300",
    poem: "Like an angel she came from heaven above\nShe shared her compassion, her pain, her love\nShe only stayed with us long enough to teach\nThat miracles come within each of our reach",
    retired: "1999-04-13",
    notes: "Diana Memorial bear. First release had PVC pellets (rarer); later PE pellets. Check tag for indented 'P.E. Pellets' for later version."
  },
  {
    name: "Peanut the Royal Blue Elephant",
    year: 1995,
    birthday: "1995-01-25",
    style: "4062",
    poem: "Peanut the elephant walks on tip-toes\nQuiet and gentle wherever she goes\nShe'll bring you luck and happiness\nYou'll love her cuteness, we must confess!",
    retired: "1998-05-01",
    notes: "Royal (dark) Blue version is the rare one — manufactured by mistake in 1995, only about 2000 made. Light blue version is common."
  },
  {
    name: "Peanut the Light Blue Elephant",
    year: 1995,
    birthday: "1995-01-25",
    style: "4062",
    poem: "Peanut the elephant walks on tip-toes\nQuiet and gentle wherever she goes\nShe'll bring you luck and happiness\nYou'll love her cuteness, we must confess!",
    retired: "1998-05-01",
    notes: "Light blue version — much more common than Royal Blue."
  },
  {
    name: "Patti the Platypus",
    year: 1993,
    birthday: "1993-01-06",
    style: "4025",
    poem: "Ran into Patti one day while walking\nOnce she started I couldn't stop her talking\nHer stories were long and sometimes dreary\nBut Patti's my friend and I love her dearly!",
    retired: "1998-05-01",
    notes: "Originally came in deep fuchsia / maroon color (rare); later changed to magenta/raspberry. Original 9 Beanie Baby."
  },
  {
    name: "Pinchers the Lobster",
    year: 1993,
    birthday: "1993-06-19",
    style: "4026",
    poem: "This lobster loves to pinch\nGrocery shopping is a cinch\nDon't get too close or you will know\nPinchers the lobster is no foe!",
    retired: "1998-05-01",
    notes: "Original 9 Beanie Baby. Early ones had 'Punchers' tag error (extremely rare)."
  },
  {
    name: "Chocolate the Moose",
    year: 1993,
    birthday: "1993-04-27",
    style: "4015",
    poem: "Licorice, gum and peppermint candy\nThis moose always has these handy\nThere is one more thing he likes to eat\nGuess! It's his favorite treat!",
    retired: "1998-12-31",
    notes: "Original 9 Beanie Baby."
  },
  {
    name: "Splash the Whale",
    year: 1993,
    birthday: "1993-07-08",
    style: "4022",
    poem: "Splash loves to jump and dive\nHe's the fastest whale alive\nHe always wanted to basketball dunk\nBut Splash the whale is just a punk!",
    retired: "1997-05-11",
    notes: "Original 9 Beanie Baby. Retired relatively early."
  },
  {
    name: "Legs the Frog",
    year: 1993,
    birthday: "1993-04-25",
    style: "4020",
    poem: "Legs lives in a hollow log\nSwimming in his favorite bog\nFlies and mosquitoes are his dish\nThe sight of him makes bugs all wish!",
    retired: "1997-10-01",
    notes: "Original 9 Beanie Baby."
  },
  {
    name: "Squealer the Pig",
    year: 1993,
    birthday: "1993-04-23",
    style: "4005",
    poem: "Squealer likes to joke around\nHe is known as class clown\nMaking noises and telling jokes\nHe's friends with all the other folks!",
    retired: "1998-05-01",
    notes: "Original 9 Beanie Baby."
  },
  {
    name: "Spot the Dog",
    year: 1993,
    birthday: "1993-01-03",
    style: "4000",
    poem: "See Spot sprint, see Spot run\nYou and Spot will have lots of fun\nSpot likes to play a lot with a ball\nBut it is you he likes best of all!",
    retired: "1998-10-01",
    notes: "Original 9 Beanie Baby. WITHOUT SPOT (no spot on back) is the extremely rare early version — could be worth thousands."
  },
  {
    name: "Flash the Dolphin",
    year: 1993,
    birthday: "1993-05-13",
    style: "4021",
    poem: "You'll find Flash beneath the sea\nSwimming with friends so merrily\nHe flips and twirls and wiggles too\nSwimming in water so bright blue!",
    retired: "1997-05-11",
    notes: "Original 9 Beanie Baby."
  },
  {
    name: "Brownie / Cubbie the Bear",
    year: 1993,
    birthday: "1993-11-14",
    style: "4010",
    poem: "Cubbie used to eat crackers and honey\nAnd what happened to him was funny\nHe was stung by fourteen bees\nNow Cubbie eats broccoli and cheese!",
    retired: "1997-12-31",
    notes: "Originally named 'Brownie' — very rare. Renamed 'Cubbie' in late 1993. First bear ever."
  },
  {
    name: "Valentino the Bear",
    year: 1994,
    birthday: "1994-02-14",
    style: "4058",
    poem: "His heart is red and full of love\nHe cares for you so give him a hug\nJust keep him close when feeling blue\nFeel the love he has for you!",
    retired: "1999-12-31",
    notes: "White bear with red heart. Tag errors (misspellings like 'orignal') can add value."
  },
  {
    name: "Peace the Bear",
    year: 1996,
    birthday: "1996-02-01",
    style: "4053",
    poem: "All races, all colors, under the sun\nJoin hands together and have some fun\nDance to the music, rock and roll is the sound\nPeace and love make the world go 'round!",
    retired: "1999-07-14",
    notes: "Tie-dye bear — each one is unique. Darker/brighter colored versions are more sought after."
  },
  {
    name: "Erin the Bear",
    year: 1997,
    birthday: "1997-03-17",
    style: "4186",
    poem: "Named after the beautiful Emerald Isle\nThis Beanie Baby will make you smile\nA bit of luck, a pot of gold\nRoaming green hills far from old!",
    retired: "1999-05-01",
    notes: "Green Irish bear with shamrock. St. Patrick's Day themed."
  },
  {
    name: "Glory the Bear",
    year: 1997,
    birthday: "1997-07-04",
    style: "4188",
    poem: "Wearing the flag for all to see\nSymbol of freedom for you and me\nRed white and blue - the colors come\nLets all hear it for the Fourth of July!",
    retired: "1998-12-31",
    notes: "1998 MLB All-Star Game commemorative — those versions are rarer."
  },
  {
    name: "Millennium (originally Millenium) the Bear",
    year: 1999,
    birthday: "1999-01-01",
    style: "4226",
    poem: "A brand new century has come to call\nHealth and happiness to one and all\nBring on the fireworks and all the fun\nCelebrate the Millennium it has only begun!",
    retired: "2000-03-17",
    notes: "Original tag misspells 'Millennium' as 'Millenium' — common. Corrected versions exist too. Check both tags."
  },
  {
    name: "Curly the Bear",
    year: 1996,
    birthday: "1996-04-12",
    style: "4052",
    poem: "A bear so cute with hair that's curly\nYou will love him, so say 'Hurley!'\nHe'll be your friend and loves to play\nHope he can visit you some day!",
    retired: "1998-12-31",
    notes: "Brown curly-napped fabric bear."
  },
  {
    name: "Garcia the Bear",
    year: 1996,
    birthday: "1995-08-01",
    style: "4051",
    poem: "The old Beanies all parade single file\nHe tye-dyed them when he came in style\nLooking good has always been his aim\nAnd you'll love it, we know, just the same!",
    retired: "1997-05-11",
    notes: "Jerry Garcia tribute (Grateful Dead). Pulled from shelves due to licensing — makes it desirable."
  },
  {
    name: "Humphrey the Camel",
    year: 1993,
    birthday: "",
    style: "4060",
    poem: "",
    retired: "1995-06-15",
    notes: "Very early retirement makes Humphrey highly valuable. No poem on original tag. One of the most sought-after early Beanies."
  },
  {
    name: "Quackers the Duck",
    year: 1994,
    birthday: "1994-04-19",
    style: "4024",
    poem: "There is a duck by the name of Quackers\nEvery night he eats animal crackers\nHe swims in a lake that's clear and blue\nBut he'll come to visit and play with you!",
    retired: "1998-05-01",
    notes: "Early 'Quacker' version (no 's', no wings) is extremely rare."
  },
  {
    name: "Inky the Octopus",
    year: 1994,
    birthday: "1994-11-29",
    style: "4028",
    poem: "Inky's head is big and round\nAs he swims he makes no sound\nIf you need a hand, don't hesitate\nInky can help because he has eight!",
    retired: "1998-05-01",
    notes: "Tan (no mouth) version is oldest and rarest. Pink version most common."
  },
  {
    name: "Digger the Crab",
    year: 1994,
    birthday: "1994-08-23",
    style: "4027",
    poem: "Digging in the sand and walking sideways\nThat's how Digger spends her days\nHard on the outside but sweet deep inside\nDigger makes a great friend to confide!",
    retired: "1997-05-11",
    notes: "Original orange version is rarer than red."
  },
  {
    name: "Nuts the Squirrel",
    year: 1996,
    birthday: "1996-01-21",
    style: "4114",
    poem: "With his bushy tail he'll scamper up a tree\nThe most cheerful critter you'll ever see\nHe's a squirrel friend who's so unique\nAcorns to him are a tasty treat!",
    retired: "1999-12-31"
  },
  {
    name: "Twigs the Giraffe",
    year: 1995,
    birthday: "1995-05-19",
    style: "4068",
    poem: "Twigs has his head in the clouds\nHe stands tall, he stands proud\nWith twigs thick and twigs so fine\nGracefully bending down to dine!",
    retired: "1998-05-01"
  },
  {
    name: "Stripes the Tiger",
    year: 1995,
    birthday: "1995-06-11",
    style: "4065",
    poem: "Stripes was never fierce nor strong\nSo with tigers he didn't get along\nNow he watches from trees up above\nAnd clings to people with his love!",
    retired: "1999-05-01",
    notes: "Dark/old-face version (fuzzy, gold) is rare. Lighter version more common."
  },
  {
    name: "Ears the Bunny",
    year: 1995,
    birthday: "1995-04-18",
    style: "4018",
    poem: "He's a bunny with ears so floppy\nHe hops around being rather hoppy\nMunch on a carrot, sniff a flower\nEars can do this for hours and hours!",
    retired: "1998-05-01"
  },
  {
    name: "Hoppity the Bunny",
    year: 1996,
    birthday: "1996-04-03",
    style: "4117",
    poem: "Hopscotch and Jump Rope are all the rage\nHoppity plays until it's time to turn the page\nBouncing and skipping is what she likes best\nNothing to Hoppity is just a pest!",
    retired: "1998-05-01",
    notes: "Pink bunny. Part of the Easter bunny trio (Hoppity, Floppity, Hippity)."
  },
  {
    name: "Floppity the Bunny",
    year: 1996,
    birthday: "1996-05-28",
    style: "4118",
    poem: "Floppity hops from here to there\nSearching for eggs without a care\nDon't stop 'til her basket is filled with cheer\nHappy Easter to all, far and near!",
    retired: "1998-05-01",
    notes: "Lavender bunny. Part of the Easter trio."
  },
  {
    name: "Hippity the Bunny",
    year: 1996,
    birthday: "1996-06-01",
    style: "4119",
    poem: "Hippity is a cute little bunny\nDressed in green, he looks quite funny\nEaster eggs he likes to hide\nGiving them to friends with pride!",
    retired: "1998-05-01",
    notes: "Mint green bunny. Part of the Easter trio."
  },
  {
    name: "Claude the Crab",
    year: 1996,
    birthday: "1996-09-03",
    style: "4083",
    poem: "Claude the crab paints by the sea\nA famous artist he hopes to be\nBut the tide came in and his paints fell\nNow his art is on his shell!",
    retired: "1998-12-31",
    notes: "Tie-dye crab."
  },
  {
    name: "Seaweed the Otter",
    year: 1995,
    birthday: "1996-03-19",
    style: "4080",
    poem: "Seaweed is what she likes to eat\nShe finds it such a tasty treat\nShe's known as the clown of the sea\nCatch her if you can, but don't say we warned thee!",
    retired: "1998-09-19"
  },
  {
    name: "Bongo the Monkey",
    year: 1995,
    birthday: "1995-08-17",
    style: "4067",
    poem: "Bongo the monkey lives in a tree\nThe happiest monkey you'll ever see\nIn his spare time he plays the guitar\nOne of these days he will be a big star!",
    retired: "1998-12-31",
    notes: "Originally named 'Nana' — extremely rare version exists with that name on tag."
  },
  {
    name: "Mel the Koala",
    year: 1996,
    birthday: "1996-01-15",
    style: "4162",
    poem: "How do you name a Koala bear?\nIt's rather tough, I do declare!\nIt confuses me, I get into a funk\nI'll name him Mel, after my favorite hunk!",
    retired: "1998-03-01"
  },
  {
    name: "Lucky the Ladybug",
    year: 1994,
    birthday: "1995-05-01",
    style: "4040",
    poem: "Lucky the lady bug loves the lotto\n'Someone must win' that's her motto\nBut save your money and get out of the rain\nHonest Lucky's no cheat, it's the luck of the game!",
    retired: "1998-05-01",
    notes: "7 glued-on spots (original) versions are rarer. Later versions have printed spots (11 or 21)."
  },
  {
    name: "Tabasco the Bull",
    year: 1995,
    birthday: "1995-05-15",
    style: "4002",
    poem: "Bold and brave, on the run\nTabasco really is the one\nFrom the fields to the ring of fame\nA star of rodeo he became!",
    retired: "1996-12-31",
    notes: "Retired due to trademark issues with Tabasco sauce — renamed Snort. Makes Tabasco rarer."
  },
  {
    name: "Snort the Bull",
    year: 1997,
    birthday: "1996-05-15",
    style: "4002",
    poem: "Although Snort is not so tall\nHe loves to play with his friend a ball\nHe runs around kicking up dust\nCatching Snort is always a must!",
    retired: "1998-09-15",
    notes: "Replacement for Tabasco. Has cream paws (Tabasco has red paws)."
  },
  {
    name: "Mystic the Unicorn",
    year: 1994,
    birthday: "1994-05-21",
    style: "4007",
    poem: "Once upon a time so far away\nA unicorn was born one day in May\nMystic is this unicorn so it's told\nNow the stories unfold!",
    retired: "1999-05-01",
    notes: "Several versions: Fine-mane (earliest, rarest), Coarse-mane tan horn, Iridescent horn, Rainbow mane."
  },
  {
    name: "Magic the Dragon",
    year: 1995,
    birthday: "1995-09-05",
    style: "4088",
    poem: "Magic the dragon lives in a dream\nThe most beautiful place you've ever seen\nThrough magic lands she roams\nMeet up with her and you'll feel right at home!",
    retired: "1997-12-31",
    notes: "Pale thread vs. hot pink thread versions (pale is rarer)."
  },
  {
    name: "Zip the Cat",
    year: 1995,
    birthday: "1995-03-28",
    style: "4004",
    poem: "Keep Zip by your side all the day through\nGood luck he will bring to you\nIf you have a wish, don't hold back\nJust tell Zip and good luck he'll pack!",
    retired: "1998-05-01",
    notes: "All-black version is the rarest. White-face version next. White belly version most common."
  },
  {
    name: "Chip the Calico Cat",
    year: 1996,
    birthday: "1996-01-26",
    style: "4121",
    poem: "Black and gold, brown and white\nThe shades of her coat are quite a sight\nAt mixing her colors she was a master\nOn anyone else it would be a disaster!",
    retired: "1999-03-31"
  },
  {
    name: "Scoop the Pelican",
    year: 1996,
    birthday: "1996-07-01",
    style: "4107",
    poem: "All day long he scoops up fish\nTo fill his bill, is his wish\nDiving fast and diving low\nHoping those fish are very slow!",
    retired: "1998-12-31"
  },
  {
    name: "Waddle the Penguin",
    year: 1995,
    birthday: "1995-12-19",
    style: "4075",
    poem: "Waddle in his tuxedo, walks out of the door\nAlways having fun, you can't help but adore\nHe walks with his friends in a funny way\nHave fun with Waddle, don't let him stray!",
    retired: "1998-05-01"
  },
  {
    name: "Pinky the Flamingo",
    year: 1995,
    birthday: "1995-02-13",
    style: "4072",
    poem: "Pinky loves the Everglades\nFrom the hottest pink she's made\nWith floppy legs and big orange beak\nShe's the Beanie that you seek!",
    retired: "1998-12-31"
  },
  {
    name: "Blackie the Bear",
    year: 1994,
    birthday: "1994-07-15",
    style: "4011",
    poem: "Living in a national park\nHe only played after dark\nThen he met his friend Cubbie\nNow they play when it's sunny!",
    retired: "1998-09-15"
  },
  {
    name: "Teddy the Brown Bear",
    year: 1993,
    birthday: "1995-11-28",
    style: "4050",
    poem: "Teddy wanted to go out today\nAll of his friends went out to play\nBut he'd rather help whatever you do\nAfter all, his best friend is you!",
    retired: "1997-10-01",
    notes: "New Face (NF) vs Old Face (OF). OF Teddy in any color is very rare (1993)."
  },
  {
    name: "Happy the Hippo",
    year: 1994,
    birthday: "1994-02-25",
    style: "4061",
    poem: "Happy the Hippo loves to wade\nIn the waters and the shade\nWhen Happy shoots water out of his snout\nYou know he's happy without a doubt!",
    retired: "1998-05-01",
    notes: "Original gray version is rarer than lavender."
  },
  {
    name: "Daisy the Cow",
    year: 1994,
    birthday: "1994-05-10",
    style: "4006",
    poem: "Daisy drinks milk each night\nSo her coat is shiny and bright\nMilk is good for your hair and skin\nWhat a way for your day to begin!",
    retired: "1998-09-15"
  },
  {
    name: "Slither the Snake",
    year: 1993,
    birthday: "",
    style: "4031",
    poem: "",
    retired: "1995-06-15",
    notes: "Retired early — highly collectible. Original 9 Beanie Baby."
  },
  {
    name: "Web the Spider",
    year: 1993,
    birthday: "",
    style: "4041",
    poem: "",
    retired: "1995-09-15",
    notes: "Very early retirement. Never had a poem on tag. Highly sought after."
  },
  {
    name: "Spooky the Ghost",
    year: 1995,
    birthday: "1995-10-31",
    style: "4090",
    poem: "Ghosts can be a scary sight\nBut don't let Spooky bring you fright\nBecause when you're alone, you will see\nThe best friend that Spooky can be!",
    retired: "1997-12-31",
    notes: "Originally named 'Spook' — very rare early tag version."
  },
  {
    name: "Pumkin' the Pumpkin",
    year: 1998,
    birthday: "1998-10-31",
    style: "4205",
    poem: "Ghosts and goblins are out tonight\nTrick or treaters, I'll give a fright\nHere's a Beanie Baby to make you smile\nHappy Halloween - just for a while!",
    retired: "1998-12-31",
    notes: "Short production — only a few months."
  },
  {
    name: "Gobbles the Turkey",
    year: 1997,
    birthday: "1997-11-27",
    style: "4034",
    poem: "Gobbles the turkey loves to eat\nEverything is her favorite treat\nIf you're not careful she will get to your sweets\nEspecially the Thanksgiving treats!",
    retired: "1999-03-31"
  },
  {
    name: "1997 Teddy (Holiday Teddy)",
    year: 1996,
    birthday: "1996-12-25",
    style: "4200",
    poem: "Beanie Babies are special, no doubt\nAll of them have Holiday cheer\nIf you have this bear by you\nYou will have a wonderful year!",
    retired: "1997-12-31",
    notes: "Dark green scarf Holiday bear. First Holiday Teddy."
  },
  {
    name: "Halo the Bear",
    year: 1998,
    birthday: "1998-08-31",
    style: "4208",
    poem: "When you sleep, I'm always here\nDon't be afraid, I am near\nWatching over you with lots of love\nYour guardian angel from up above!",
    retired: "1999-09-14",
    notes: "White angel bear with iridescent wings."
  },
  {
    name: "Britannia the Bear",
    year: 1997,
    birthday: "1997-12-15",
    style: "4601",
    poem: "Britannia the bear will sail the seas\nSo she can be with you and me\nShe's always sure to catch the tide\nAnd wear the Union Jack with pride!",
    retired: "1999-07-23",
    notes: "UK exclusive — brown bear with Union Jack on chest. Harder to find in US market."
  },
  {
    name: "Maple the Bear",
    year: 1996,
    birthday: "1996-07-01",
    style: "4600",
    poem: "Maple the bear likes to ski\nWith his friends, he plays hockey\nHe loves his pure maple syrup\nBest on pancakes, he is sure!",
    retired: "2000-07-10",
    notes: "Canadian exclusive with maple leaf on chest. Early 'Pride' name version is extremely rare."
  },
  {
    name: "Claude the Crab (Tie-Dye)",
    year: 1996,
    birthday: "1996-09-03",
    style: "4083",
    poem: "Claude the crab paints by the sea\nA famous artist he hopes to be\nBut the tide came in and his paints fell\nNow his art is on his shell!",
    retired: "1998-12-31"
  },

  // ============================================================
  // v0.6.0 expansion — facts-only (poems left blank)
  // ============================================================

  // Holiday & seasonal bears
  {
    name: "1998 Holiday Teddy",
    year: 1998, birthday: "1998-12-25", style: "4204", poem: "",
    retired: "1998-12-31",
    notes: "Holiday-exclusive teddy with green ribbon. Released and retired in the same holiday window."
  },
  {
    name: "1999 Holiday Teddy",
    year: 1999, birthday: "1999-12-25", style: "4257", poem: "",
    retired: "1999-12-23",
    notes: "Holiday-exclusive with red ribbon and snowflake. Released and retired in the same holiday window."
  },
  {
    name: "2000 Holiday Teddy",
    year: 2000, birthday: "2000-12-14", style: "4332", poem: "",
    retired: "2001-12-26"
  },
  {
    name: "Valentina the Bear",
    year: 1998, birthday: "1998-02-14", style: "4233", poem: "",
    retired: "1999-12-23",
    notes: "Pink Valentine's bear with red heart on chest. Companion to Valentino."
  },
  {
    name: "Sammy the Bear",
    year: 1998, birthday: "1998-06-23", style: "4215", poem: "",
    retired: "1999-12-23",
    notes: "Tie-dye bear in pinks/yellows. Each one's color pattern is unique."
  },
  {
    name: "Hope the Bear",
    year: 1998, birthday: "1999-03-23", style: "4213", poem: "",
    retired: "1999-12-23",
    notes: "Tan praying bear with paws together."
  },
  {
    name: "Fortune the Panda",
    year: 1997, birthday: "1997-12-06", style: "4196", poem: "",
    retired: "1999-08-24"
  },
  {
    name: "Almond the Bear",
    year: 1999, birthday: "1999-04-14", style: "4246", poem: "",
    retired: "2000-03-15",
    notes: "Light tan bear, plain (no tag/ribbon embellishments)."
  },
  {
    name: "Mac the Cardinal",
    year: 1999, birthday: "1998-06-10", style: "4225", poem: "",
    retired: "1999-12-23",
    notes: "Bright red bird, named in homage to Mark McGwire (1998 home-run year)."
  },
  {
    name: "Libearty the Bear",
    year: 1996, birthday: "1996-07-04", style: "4057", poem: "",
    retired: "1997-01-01",
    notes: "USA-flag bear. Tag intentionally misspells 'Liberty' as 'Libearty'. Short shelf life — retired ~6 months after release."
  },
  {
    name: "Osito the Bear",
    year: 1999, birthday: "1999-02-05", style: "4244", poem: "",
    retired: "2000-12-15",
    notes: "Mexican-flag bear, USA exclusive (sold mainly in border-state and Mexican-American markets)."
  },

  // Dogs
  {
    name: "Bones the Dog",
    year: 1994, birthday: "1994-01-18", style: "4001", poem: "",
    retired: "1998-05-01",
    notes: "Tan dog with floppy ears."
  },
  {
    name: "Bruno the Bull Terrier",
    year: 1997, birthday: "1997-09-09", style: "4183", poem: "",
    retired: "1999-09-18"
  },
  {
    name: "Doby the Doberman",
    year: 1996, birthday: "1996-10-09", style: "4110", poem: "",
    retired: "1998-12-31"
  },
  {
    name: "Fetch the Golden Retriever",
    year: 1998, birthday: "1997-02-04", style: "4189", poem: "",
    retired: "1999-12-23"
  },
  {
    name: "Pugsly the Pug",
    year: 1997, birthday: "1996-05-02", style: "4106", poem: "",
    retired: "1999-03-31"
  },
  {
    name: "Rover the Dog",
    year: 1996, birthday: "1996-05-30", style: "4101", poem: "",
    retired: "1998-05-01",
    notes: "Bright red dog. Common dog name applied to a not-quite-realistic color."
  },
  {
    name: "Tracker the Basset Hound",
    year: 1998, birthday: "1997-06-05", style: "4198", poem: "",
    retired: "2000-09-12"
  },
  {
    name: "Wrinkles the Bulldog",
    year: 1996, birthday: "1996-05-01", style: "4103", poem: "",
    retired: "1998-09-22"
  },

  // Cats
  {
    name: "Nip the Cat",
    year: 1995, birthday: "1994-03-06", style: "4003", poem: "",
    retired: "1997-12-31",
    notes: "Gold cat. Three main versions: all-gold (rarest), white-face/belly, and white-paws — all share the style number, value differs significantly."
  },
  {
    name: "Snip the Cat",
    year: 1997, birthday: "1996-10-22", style: "4120", poem: "",
    retired: "1998-12-31",
    notes: "Siamese-coloration cat (cream body, dark face/legs/tail)."
  },
  {
    name: "Pounce the Cat",
    year: 1998, birthday: "1997-08-28", style: "4122", poem: "",
    retired: "1999-03-31"
  },
  {
    name: "Prance the Cat",
    year: 1998, birthday: "1997-11-20", style: "4123", poem: "",
    retired: "1999-12-23"
  },

  // Birds
  {
    name: "Baldy the Eagle",
    year: 1997, birthday: "1996-02-17", style: "4074", poem: "",
    retired: "1998-05-01"
  },
  {
    name: "Caw the Crow",
    year: 1995, birthday: "", style: "4071", poem: "",
    retired: "1996-06-15",
    notes: "Early retirement (~7 months on shelves), harder to find than most 1995 entries."
  },
  {
    name: "Hoot the Owl",
    year: 1995, birthday: "1995-08-09", style: "4073", poem: "",
    retired: "1997-10-01"
  },
  {
    name: "Jabber the Parrot",
    year: 1998, birthday: "1997-10-10", style: "4197", poem: "",
    retired: "1999-03-31"
  },
  {
    name: "Wise the Owl",
    year: 1998, birthday: "1997-05-31", style: "4187", poem: "",
    retired: "1998-12-31",
    notes: "Class-of-1998 graduation cap. Sold mainly in late 1997 and the 1998 graduation season."
  },
  {
    name: "Stretch the Ostrich",
    year: 1998, birthday: "1997-09-21", style: "4182", poem: "",
    retired: "1999-03-31"
  },
  {
    name: "Gracie the Swan",
    year: 1997, birthday: "1996-06-17", style: "4126", poem: "",
    retired: "1998-05-01"
  },

  // Reptiles & amphibians
  {
    name: "Hissy the Snake",
    year: 1998, birthday: "1997-04-04", style: "4185", poem: "",
    retired: "1999-09-18"
  },
  {
    name: "Iggy the Iguana",
    year: 1997, birthday: "1997-08-12", style: "4038", poem: "",
    retired: "1999-03-31",
    notes: "Multiple production variations (tongue/no-tongue, solid blue / tie-dye) due to a 1997 mix-up with Rainbow's material — consult a collector reference for the version-by-version value spread."
  },
  {
    name: "Rainbow the Chameleon",
    year: 1997, birthday: "1997-10-14", style: "4037", poem: "",
    retired: "1999-03-31",
    notes: "Multiple production variations from the 1997 Iggy/Rainbow material mix-up. Tie-dye is common, solid versions are the value tier."
  },
  {
    name: "Smoochy the Frog",
    year: 1997, birthday: "1997-10-01", style: "4039", poem: "",
    retired: "1999-12-23"
  },
  {
    name: "Speedy the Turtle",
    year: 1994, birthday: "1993-08-14", style: "4030", poem: "",
    retired: "1997-09-30"
  },

  // Dinosaur trio (rare, all retired together 1996)
  {
    name: "Rex the Tyrannosaurus",
    year: 1995, birthday: "", style: "4086", poem: "",
    retired: "1996-06-15",
    notes: "Tie-dye orange/yellow/red. Part of the 1995 dinosaur trio (Rex / Steg / Bronty) — all retired together in 1996, all highly valuable. Style # was later reused for Righty (1996)."
  },
  {
    name: "Steg the Stegosaurus",
    year: 1995, birthday: "", style: "4087", poem: "",
    retired: "1996-06-15",
    notes: "Tie-dye green/yellow. Part of the discontinued 1995 dinosaur trio."
  },
  {
    name: "Bronty the Brontosaurus",
    year: 1995, birthday: "", style: "4085", poem: "",
    retired: "1996-06-15",
    notes: "Tie-dye blue/teal. Part of the discontinued 1995 dinosaur trio — usually the rarest of the three. Style # was later reused for Lefty (1996)."
  },

  // Ocean & water
  {
    name: "Crunch the Shark",
    year: 1997, birthday: "1996-01-13", style: "4130", poem: "",
    retired: "1998-09-24"
  },
  {
    name: "Echo the Dolphin",
    year: 1996, birthday: "1996-12-21", style: "4180", poem: "",
    retired: "1998-05-01",
    notes: "Brief tag-swap with Waves at production — versions exist where Echo's body has Waves' tag and vice versa."
  },
  {
    name: "Bubbles the Fish",
    year: 1995, birthday: "1995-07-02", style: "4078", poem: "",
    retired: "1997-05-11",
    notes: "Black-and-yellow striped angelfish. Early retirement, harder to find."
  },
  {
    name: "Coral the Fish",
    year: 1995, birthday: "1995-03-02", style: "4079", poem: "",
    retired: "1997-01-01",
    notes: "Tie-dye fish. Each one has a unique color pattern."
  },
  {
    name: "Goldie the Goldfish",
    year: 1994, birthday: "1994-11-14", style: "4023", poem: "",
    retired: "1997-12-31"
  },
  {
    name: "Sting the Stingray",
    year: 1995, birthday: "1995-08-27", style: "4077", poem: "",
    retired: "1997-01-01",
    notes: "Tie-dye stingray. Each pattern differs."
  },
  {
    name: "Manny the Manatee",
    year: 1996, birthday: "1996-06-08", style: "4081", poem: "",
    retired: "1997-05-11",
    notes: "Pinkish-grey manatee. Early retirement, hard to find."
  },
  {
    name: "Jolly the Walrus",
    year: 1997, birthday: "1996-12-02", style: "4082", poem: "",
    retired: "1998-05-01",
    notes: "Brown walrus with floppy mustache."
  },
  {
    name: "Tusk the Walrus",
    year: 1995, birthday: "1995-09-18", style: "4076", poem: "",
    retired: "1997-01-01",
    notes: "Predecessor to Jolly. Two-tooth walrus. Early tag misspelled the name as 'Tusks'."
  },

  // Other mammals
  {
    name: "Whisper the Deer",
    year: 1998, birthday: "1997-04-05", style: "4194", poem: "",
    retired: "1999-08-19"
  },
  {
    name: "Mooch the Spider Monkey",
    year: 1999, birthday: "1998-08-01", style: "4224", poem: "",
    retired: "2000-09-12"
  },
  {
    name: "Prickles the Hedgehog",
    year: 1999, birthday: "1998-02-19", style: "4220", poem: "",
    retired: "1999-12-23"
  },
  {
    name: "Roam the Buffalo",
    year: 1998, birthday: "1998-09-27", style: "4209", poem: "",
    retired: "1999-08-26"
  },
  {
    name: "Roary the Lion",
    year: 1996, birthday: "1996-02-20", style: "4069", poem: "",
    retired: "1998-12-31"
  },
  {
    name: "Sly the Fox",
    year: 1996, birthday: "1996-09-12", style: "4115", poem: "",
    retired: "1998-09-22",
    notes: "Originally all-brown belly (rare); later changed to white belly (common)."
  },
  {
    name: "Stinky the Skunk",
    year: 1995, birthday: "1995-02-13", style: "4017", poem: "",
    retired: "1998-09-28"
  },
  {
    name: "Tank the Armadillo",
    year: 1995, birthday: "1995-02-22", style: "4031", poem: "",
    retired: "1997-10-01",
    notes: "Three main shell variations: 7-line (oldest, no shell — rarest), 9-line, and 9-line with sewn shell flap. Value differs significantly between them."
  },
  {
    name: "Slowpoke the Sloth",
    year: 1999, birthday: "1999-05-20", style: "4261", poem: "",
    retired: "2000-09-12"
  },
  {
    name: "Schweetheart the Orangutan",
    year: 1999, birthday: "1999-01-23", style: "4252", poem: "",
    retired: "2000-09-12"
  },

  // Insects, critters, oddballs
  {
    name: "Inch the Inchworm",
    year: 1995, birthday: "1995-09-03", style: "4044", poem: "",
    retired: "1998-05-01",
    notes: "Felt-antenna version is older and rarer. Yarn-antenna version is later and common."
  },
  {
    name: "Glow the Lightning Bug",
    year: 2000, birthday: "2000-01-04", style: "4283", poem: "",
    retired: "2001-04-09",
    notes: "Glow-in-the-dark belly."
  },
  {
    name: "Spinner the Spider",
    year: 1996, birthday: "1996-10-28", style: "4036", poem: "",
    retired: "1998-09-19",
    notes: "Halloween-season spider. Some early tags read 'Creepy' instead of 'Spinner' — extremely rare error."
  },
  {
    name: "Stinger the Scorpion",
    year: 1998, birthday: "1997-09-29", style: "4193", poem: "",
    retired: "1999-08-13"
  },

  // Political — 1996 election cycle (very short shelf life)
  {
    name: "Lefty the Donkey",
    year: 1996, birthday: "1996-07-04", style: "4085", poem: "",
    retired: "1997-01-01",
    notes: "Democrat political bear with USA flag on chest. Style # was reused (originally Bronty's). Companion to Righty. Both retired right after the 1996 election — short window, sought after."
  },
  {
    name: "Righty the Elephant",
    year: 1996, birthday: "1996-07-04", style: "4086", poem: "",
    retired: "1997-01-01",
    notes: "Republican political bear with USA flag. Style # was reused (originally Rex's). Companion to Lefty."
  },

  // Pigs & farm
  {
    name: "Knuckles the Pig",
    year: 1999, birthday: "1999-03-25", style: "4247", poem: "",
    retired: "2000-04-19"
  },
  {
    name: "Chops the Lamb",
    year: 1996, birthday: "1996-05-03", style: "4019", poem: "",
    retired: "1997-01-01",
    notes: "Black-faced lamb. Replaced by Fleece — short shelf life makes Chops valuable."
  },
  {
    name: "Fleece the Lamb",
    year: 1997, birthday: "1996-03-21", style: "4125", poem: "",
    retired: "1998-12-31",
    notes: "Cream/napped lamb. Successor to Chops."
  }
];

// ============================================================
// Lookup functions
// ============================================================

function searchBeanieDB(query) {
  if (!query) return [];
  const q = query.toLowerCase().trim();
  // Combine seed DB + any user-added entries (cloud when signed in, else local)
  const userEntries = (typeof window !== 'undefined' && typeof window.getEffectiveUserBeanies === 'function')
    ? window.getEffectiveUserBeanies()
    : getUserBeanies();
  const all = [...BEANIE_DB, ...userEntries];

  const exact = all.filter(b => b.name.toLowerCase() === q);
  const starts = all.filter(b => b.name.toLowerCase().startsWith(q) && !exact.includes(b));
  const contains = all.filter(b => b.name.toLowerCase().includes(q) && !exact.includes(b) && !starts.includes(b));
  return [...exact, ...starts, ...contains].slice(0, 12);
}

function getUserBeanies() {
  try {
    const raw = localStorage.getItem('theLedger.userBeanies.v1');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveUserBeanie(entry) {
  const list = getUserBeanies();
  // Replace if existing with same name (case-insensitive)
  const idx = list.findIndex(e => e.name.toLowerCase() === entry.name.toLowerCase());
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  localStorage.setItem('theLedger.userBeanies.v1', JSON.stringify(list));
}
