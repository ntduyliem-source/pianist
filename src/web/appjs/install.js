const fs = require('fs');
const path = require('path');

console.log("install js api step")

var args = process.argv.slice(2);
console.log("args:", args)
console.log("__dirname:", __dirname);

const HERE=__dirname
const ROOT=HERE+"/../../.."
const OUTPUT_DIR = args.length > 0 ? args[0] : "./out"
const MUSE_MODULE_AUDIO_WORKER = "OFF"

function copyFile(src, dst) {
    try {
      fs.copyFileSync(src, dst);
      console.info("success: coped " + src + " => " + dst)
    } catch (err) {
      throw new Error("Failed to copy " + src + " => " + dst, { cause: err });
    }
}

function replaceAll(str, find, replace) {
  return String(str).replace(new RegExp(find, 'g'), replace);
}

function configure(file, out) {
  var content = fs.readFileSync(file)
  content = replaceAll(content, "{{MUSE_MODULE_AUDIO_WORKER}}", MUSE_MODULE_AUDIO_WORKER);
  fs.writeFileSync(out, content);
}

// Remove Unnecessary Qt files
fs.rmSync(OUTPUT_DIR+"/MuseScoreStudio.html", {force: true})
fs.rmSync(OUTPUT_DIR+"/qtloader.js", {force: true})
fs.rmSync(OUTPUT_DIR+"/qtlogo.svg", {force: true})

// Configure and copy config
fs.mkdirSync(OUTPUT_DIR+"/distr", { recursive: true });
configure(HERE+"/distr/config.js.in", OUTPUT_DIR+"/distr/config.js")

// Copy api 
copyFile(HERE+"/distr/muapi.js", OUTPUT_DIR+"/distr/muapi.js");
copyFile(HERE+"/distr/muimpl.js", OUTPUT_DIR+"/distr/muimpl.js");
copyFile(HERE+"/distr/qtloader.js", OUTPUT_DIR+"/distr/qtloader.js");
copyFile(HERE+"/distr/audioworker.js", OUTPUT_DIR+"/distr/audioworker.js");
copyFile(HERE+"/distr/audiodriver.js", OUTPUT_DIR+"/distr/audiodriver.js"); 
copyFile(HERE+"/distr/audio-ready.js", OUTPUT_DIR+"/distr/audio-ready.js");
copyFile(HERE+"/distr/native-playback-clock.js", OUTPUT_DIR+"/distr/native-playback-clock.js");
copyFile(HERE+"/distr/audio_worklet_processor.js", OUTPUT_DIR+"/distr/audio_worklet_processor.js");

// Copy viewer
copyFile(HERE+"/viewer/viewer.html", OUTPUT_DIR+"/viewer.html");
copyFile(HERE+"/viewer/pianist.html", OUTPUT_DIR+"/pianist.html");
copyFile(HERE+"/viewer/pianist.html", OUTPUT_DIR+"/index.html");
copyFile(HERE+"/viewer/manifest.webmanifest", OUTPUT_DIR+"/manifest.webmanifest");
copyFile(HERE+"/viewer/icon.svg", OUTPUT_DIR+"/icon.svg");
copyFile(HERE+"/viewer/index.html", OUTPUT_DIR+"/MuseScoreStudio.html"); 

// Copy tools
copyFile(HERE+"/viewer/run_server.sh", OUTPUT_DIR+"/run_server.sh");

// Copy SF if need
const SF_SRC=ROOT+"/share/sound/MS Basic.sf3"
const SF_DST=OUTPUT_DIR+"/sound/MS Basic.sf3";
if (!fs.existsSync(SF_DST)) {
  fs.mkdirSync(OUTPUT_DIR+"/sound", { recursive: true });
  copyFile(SF_SRC, SF_DST);
}

copyFile(ROOT+"/LICENSE.txt", OUTPUT_DIR+"/LICENSE.txt");
copyFile(ROOT+"/share/sound/MS Basic_License.md", OUTPUT_DIR+"/sound/MS Basic_License.md");
copyFile(ROOT+"/share/sound/MS Basic_Readme.md", OUTPUT_DIR+"/sound/MS Basic_Readme.md");
copyFile(ROOT+"/docs/THIRD_PARTY_NOTICES.md", OUTPUT_DIR+"/THIRD_PARTY_NOTICES.md");
function copyFontNotices(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const path = require('path');
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) copyFontNotices(source);
    else if (/license|copying|ofl/i.test(entry.name)) {
      const target = path.join(OUTPUT_DIR, 'notices', 'fonts', path.relative(ROOT+'/fonts', source));
      fs.mkdirSync(path.dirname(target), {recursive:true}); fs.copyFileSync(source, target);
    }
  }
}
copyFontNotices(ROOT+'/fonts');
fs.mkdirSync(OUTPUT_DIR+"/templates", { recursive: true });
copyFile(HERE+"/templates/blank-piano.mscz", OUTPUT_DIR+"/templates/blank-piano.mscz");

// Optional user-provided local example. The public source still works with the CC0 fixture.
fs.mkdirSync(OUTPUT_DIR+"/examples", { recursive: true });
const localExample = ROOT+"/examples/local/pho-xa.mxl";
const example = fs.existsSync(localExample)
  ? { title: "Phố Xa", filename: "Phố Xa — piano.mxl", url: "examples/pho-xa.mxl" }
  : { title: "Piano khởi động", filename: "Piano khởi động.mxl", url: "fixtures/piano.mxl" };
if (fs.existsSync(localExample)) copyFile(localExample, OUTPUT_DIR+"/examples/pho-xa.mxl");
fs.writeFileSync(OUTPUT_DIR+"/examples/catalog.json", JSON.stringify({examples:[example]}, null, 2));
// Public scores are an explicit curated catalog, independent of private examples.
const library = ROOT+"/scores/library";
if (fs.existsSync(library+"/catalog.json")) {
    const catalog = JSON.parse(fs.readFileSync(library+"/catalog.json", "utf8"));
    const songsDir = path.resolve(OUTPUT_DIR, 'library/songs');
    const approved = new Set(catalog.songs.map(song => {
        if (!/^library\/songs\/[a-z0-9-]+\.mxl$/.test(song.url)) throw new Error('Invalid curated score path');
        return path.basename(song.url);
    }));
    fs.mkdirSync(songsDir, {recursive:true});
    // A removed catalog edition must not survive at its former local URL.
    // Only generated score files in this exact output directory are removed.
    for (const entry of fs.readdirSync(songsDir, {withFileTypes:true})) {
        if (!entry.isFile() || !entry.name.endsWith('.mxl') || approved.has(entry.name)) continue;
        const target = path.resolve(songsDir, entry.name);
        if (path.dirname(target) !== songsDir) throw new Error('Unsafe stale score path');
        fs.unlinkSync(target);
    }
    copyFile(library+"/catalog.json", OUTPUT_DIR+"/library/catalog.json");
    for (const song of catalog.songs) {
        const filename = song.url.split('/').pop();
        copyFile(library+"/songs/"+filename, OUTPUT_DIR+"/library/songs/"+filename);
    }
    const previewsPath = path.join(library, 'previews/manifest.json');
    if (fs.existsSync(previewsPath)) {
        const previews = JSON.parse(fs.readFileSync(previewsPath, 'utf8'));
        fs.mkdirSync(path.join(OUTPUT_DIR,'library/previews'), {recursive:true});
        copyFile(previewsPath,path.join(OUTPUT_DIR,'library/previews/manifest.json'));
        for (const image of previews.files) {
            if (!/^library\/previews\/[a-f0-9]{64}\.webp$/.test(image.path)) throw new Error('Unsafe preview path');
            copyFile(path.join(library,'previews',path.basename(image.path)),path.join(OUTPUT_DIR,image.path));
        }
    }
}
// Method books keep their own catalog/order and do not enter the song library.
// Copy only explicit catalog entries; never publish acquisition/pending files.
const methods = path.resolve(ROOT, 'scores/methods');
if (fs.existsSync(path.join(methods, 'catalog.json'))) {
    const catalog = JSON.parse(fs.readFileSync(path.join(methods, 'catalog.json'), 'utf8'));
    const methodsDir = path.resolve(OUTPUT_DIR, 'methods');
    const approved = new Set(catalog.books.flatMap(book => book.lessons.map(lesson => {
        if (!/^methods\/[a-z0-9-]+\/[a-z0-9-]+\.mxl$/.test(lesson.file)) throw new Error('Unsafe method lesson path');
        return lesson.file.slice('methods/'.length);
    })));
    fs.mkdirSync(methodsDir, {recursive:true});
    for (const book of fs.readdirSync(methodsDir, {withFileTypes:true})) {
        if (!book.isDirectory() || !/^[a-z0-9-]+$/.test(book.name)) continue;
        const bookDir = path.resolve(methodsDir, book.name);
        if (path.dirname(bookDir) !== methodsDir) throw new Error('Unsafe stale method directory');
        for (const entry of fs.readdirSync(bookDir, {withFileTypes:true})) {
            if (!entry.isFile() || !entry.name.endsWith('.mxl') || approved.has(book.name+'/'+entry.name)) continue;
            const target = path.resolve(bookDir, entry.name);
            if (path.dirname(target) !== bookDir) throw new Error('Unsafe stale method lesson path');
            fs.unlinkSync(target);
        }
    }
    copyFile(path.join(methods, 'catalog.json'), path.join(methodsDir, 'catalog.json'));
    for (const name of approved) {
        const target = path.join(methodsDir, name);
        fs.mkdirSync(path.dirname(target), {recursive:true});
        copyFile(path.join(methods, name), target);
    }
    if (fs.existsSync(path.join(methods, 'NOTICE.txt'))) {
        copyFile(path.join(methods, 'NOTICE.txt'), path.join(methodsDir, 'NOTICE.txt'));
    }
}
fs.cpSync(ROOT+"/tests/fixtures/pianist/practice", OUTPUT_DIR+"/fixtures/practice", {recursive:true});

