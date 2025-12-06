#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use base64::{engine::general_purpose, Engine as _};
use hound::{SampleFormat, WavSpec, WavWriter};
use lofty::{Accessor, AudioFile, Probe, TaggedFileExt};
use serde::{Deserialize, Serialize};
use std::{fs, fs::File, path::{Path, PathBuf}};
use symphonia::{
    core::{
        audio::SampleBuffer,
        codecs::DecoderOptions,
        errors::Error as SymphoniaError,
        formats::FormatOptions,
        io::MediaSourceStream,
        meta::MetadataOptions,
    },
    default::{get_codecs, get_probe},
};
use tauri::command;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct MusicMetadata {
    title: String,
    artist: String,
    album: String,
    duration: f64,
    #[serde(rename = "albumArt")]
    album_art: Option<String>,
    genre: Option<String>,
    year: Option<u32>,
}

// 打开文件选择对话框
#[command]
async fn open_music_files(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter(
            "Music Files",
            &["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"],
        )
        .blocking_pick_files();

    match files {
        Some(paths) => Ok(paths
            .into_iter()
            .filter_map(|p| p.into_path().ok())
            .map(|p| p.to_string_lossy().to_string())
            .collect()),
        None => Ok(Vec::new()),
    }
}

// 读取文件并返回base64编码
#[command]
async fn read_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let data = fs::read(path).map_err(|e| format!("读取文件失败: {}", e))?;

    Ok(general_purpose::STANDARD.encode(&data))
}

// 解析音乐元数据
#[command]
async fn parse_music_metadata(file_path: String) -> Result<MusicMetadata, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let tagged_file = Probe::open(path)
        .map_err(|e| format!("打开文件失败: {}", e))?
        .read()
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();

    // 获取标签信息
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let (title, artist, album, genre, year) = if let Some(tag) = tag {
        (
            tag.title().map(|s| s.to_string()),
            tag.artist().map(|s| s.to_string()),
            tag.album().map(|s| s.to_string()),
            tag.genre().map(|s| s.to_string()),
            tag.year(),
        )
    } else {
        (None, None, None, None, None)
    };

    // 从文件名提取标题（如果没有标签）
    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未知标题")
        .to_string();

    // 提取专辑封面
    let album_art = if let Some(tag) = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
    {
        tag.pictures().first().map(|pic| {
            let mime = pic.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
            let base64_data = general_purpose::STANDARD.encode(pic.data());
            format!("data:{};base64,{}", mime, base64_data)
        })
    } else {
        None
    };

    Ok(MusicMetadata {
        title: title.unwrap_or(file_name),
        artist: artist.unwrap_or_else(|| "未知艺术家".to_string()),
        album: album.unwrap_or_else(|| "未知专辑".to_string()),
        duration,
        album_art,
        genre,
        year,
    })
}

/// 确保音频可播放，必要时对 FLAC 等格式转码为 WAV，返回可用的本地文件路径。
#[command]
async fn ensure_playable_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    // HTML5 Audio 在桌面端常见可直接播放的格式集合
    let directly_supported = [
        "mp3", "wav", "ogg", "oga", "m4a", "aac", "mp4", "webm", "opus",
    ];

    if directly_supported.contains(&ext.as_str()) {
        return Ok(file_path);
    }

    // 对 FLAC 做一次性转码
    if ext == "flac" {
        let wav_path = transcode_flac_to_wav(path)?;
        return Ok(wav_path.to_string_lossy().to_string());
    }

    Err(format!("不支持的音频格式: {}", ext))
}

/// 将 FLAC 转码为 16-bit PCM WAV，缓存至临时目录以避免重复开销。
fn transcode_flac_to_wav(src: &Path) -> Result<PathBuf, String> {
    let cache_dir = std::env::temp_dir().join("musicplayer-cache");
    fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;

    // 使用文件名作为输出基名，必要时简单规避冲突
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("audio");
    let out_path = cache_dir.join(format!("{}.wav", stem));

    // 若缓存存在且未过期则直接复用
    let needs_refresh = match (fs::metadata(&out_path), fs::metadata(src)) {
        (Ok(dst), Ok(src_meta)) => match (dst.modified().ok(), src_meta.modified().ok()) {
            (Some(d), Some(s)) => d < s,
            _ => false,
        },
        _ => true,
    };
    if !needs_refresh {
        return Ok(out_path);
    }

    let file = File::open(src).map_err(|e| format!("打开文件失败: {}", e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let probed = get_probe()
        .format(
            &Default::default(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("解析音频失败: {}", e))?;

    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "未找到默认音轨".to_string())?;

    let mut decoder = get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("创建解码器失败: {}", e))?;

    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or_else(|| "缺少采样率".to_string())?;
    let channels = track
        .codec_params
        .channels
        .ok_or_else(|| "缺少声道信息".to_string())?
        .count() as u16;

    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };

    let mut wav_writer =
        WavWriter::create(&out_path, spec).map_err(|e| format!("创建WAV失败: {}", e))?;

    let mut sample_buf: Option<SampleBuffer<i16>> = None;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(e) => return Err(format!("读取数据失败: {}", e)),
        };

        let decoded = match decoder.decode(&packet) {
            Ok(buf) => buf,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(format!("解码失败: {}", e)),
        };

        if sample_buf.is_none() {
            sample_buf = Some(SampleBuffer::<i16>::new(
                decoded.capacity() as u64,
                *decoded.spec(),
            ));
        }

        if let Some(buf) = sample_buf.as_mut() {
            buf.copy_interleaved_ref(decoded);
            for &sample in buf.samples() {
                wav_writer
                    .write_sample(sample)
                    .map_err(|e| format!("写入WAV失败: {}", e))?;
            }
        }
    }

    wav_writer
        .finalize()
        .map_err(|e| format!("完成WAV失败: {}", e))?;

    Ok(out_path)
}

// 读取歌词（从文件内嵌或在线获取）
#[command]
async fn read_lyrics(
    file_path: String,
    title: Option<String>,
    artist: Option<String>,
) -> Result<Option<String>, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("文件不存在: {}", file_path));
    }

    // 1. 尝试读取内嵌歌词
    if let Ok(tagged_file) = Probe::open(path).and_then(|p| p.read()) {
        if let Some(tag) = tagged_file
            .primary_tag()
            .or_else(|| tagged_file.first_tag())
        {
            // 检查是否有 LYRICS 帧
            for item in tag.items() {
                if let lofty::ItemKey::Lyrics = item.key() {
                    if let lofty::ItemValue::Text(lyrics) = item.value() {
                        return Ok(Some(lyrics.clone()));
                    }
                }
            }
        }
    }

    // 2. 如果没有内嵌歌词，尝试在线获取
    let search_title = title.clone();
    let search_artist = artist.clone();

    if let (Some(t), Some(a)) = (search_title, search_artist) {
        // 尝试网易云音乐
        if let Ok(lyrics) = fetch_lyrics_from_netease(&t, &a).await {
            if lyrics.is_some() {
                return Ok(lyrics);
            }
        }

        // 备用：尝试QQ音乐
        if let Ok(lyrics) = fetch_lyrics_from_qq(&t, &a).await {
            return Ok(lyrics);
        }
    }

    Ok(None)
}

// 从网易云音乐获取歌词
async fn fetch_lyrics_from_netease(title: &str, artist: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let query_string = format!("{} {}", title, artist);
    let search_query = urlencoding::encode(&query_string);

    // 搜索歌曲
    let search_url = format!(
        "https://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s={}&type=1&offset=0&total=true&limit=5",
        search_query
    );

    let search_response = client
        .get(&search_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .header("Referer", "https://music.163.com/")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {}", e))?;

    let search_data: serde_json::Value = search_response
        .json()
        .await
        .map_err(|e| format!("解析搜索结果失败: {}", e))?;

    // 获取第一首歌的ID
    let song_id = search_data
        .get("result")
        .and_then(|r| r.get("songs"))
        .and_then(|s| s.as_array())
        .and_then(|arr| arr.first())
        .and_then(|song| song.get("id"))
        .and_then(|id| id.as_i64());

    let song_id = match song_id {
        Some(id) => id,
        None => return Ok(None),
    };

    // 获取歌词
    let lyrics_url = format!(
        "https://music.163.com/api/song/lyric?id={}&lv=1&kv=1&tv=-1",
        song_id
    );

    let lyrics_response = client
        .get(&lyrics_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .header("Referer", "https://music.163.com/")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("歌词请求失败: {}", e))?;

    let lyrics_data: serde_json::Value = lyrics_response
        .json()
        .await
        .map_err(|e| format!("解析歌词失败: {}", e))?;

    let lyrics = lyrics_data
        .get("lrc")
        .and_then(|lrc| lrc.get("lyric"))
        .and_then(|l| l.as_str())
        .map(|s| s.to_string());

    Ok(lyrics)
}

// 从QQ音乐获取歌词
async fn fetch_lyrics_from_qq(title: &str, artist: &str) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();
    let query_string = format!("{} {}", title, artist);
    let search_query = urlencoding::encode(&query_string);

    // 搜索歌曲
    let search_url = format!(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=5&w={}&format=json&inCharset=utf8&outCharset=utf-8",
        search_query
    );

    let search_response = client
        .get(&search_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("Referer", "https://y.qq.com/")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {}", e))?;

    let search_data: serde_json::Value = search_response
        .json()
        .await
        .map_err(|e| format!("解析搜索结果失败: {}", e))?;

    // 获取第一首歌的songmid
    let songmid = search_data
        .get("data")
        .and_then(|d| d.get("song"))
        .and_then(|s| s.get("list"))
        .and_then(|l| l.as_array())
        .and_then(|arr| arr.first())
        .and_then(|song| song.get("songmid"))
        .and_then(|mid| mid.as_str());

    let songmid = match songmid {
        Some(mid) => mid,
        None => return Ok(None),
    };

    // 获取歌词
    let lyrics_url = format!(
        "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={}&format=json&nobase64=1",
        songmid
    );

    let lyrics_response = client
        .get(&lyrics_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        .header("Referer", "https://y.qq.com/")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("歌词请求失败: {}", e))?;

    let lyrics_data: serde_json::Value = lyrics_response
        .json()
        .await
        .map_err(|e| format!("解析歌词失败: {}", e))?;

    let lyrics = lyrics_data
        .get("lyric")
        .and_then(|l| l.as_str())
        .map(|s| s.to_string());

    Ok(lyrics)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            open_music_files,
            read_file,
            parse_music_metadata,
            read_lyrics,
            ensure_playable_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
