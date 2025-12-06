#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use base64::{engine::general_purpose, Engine as _};
use lofty::{Accessor, AudioFile, Probe, TaggedFileExt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
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
            read_lyrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
