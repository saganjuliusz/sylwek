<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
error_reporting(E_ALL);
ini_set('display_errors', 1);

function scanDirectory($dir) {
    $result = [];
    if (!is_dir($dir)) {
        return ['error' => 'Katalog nie istnieje: ' . $dir];
    }
    
    $files = scandir($dir);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        $path = $dir . '/' . $file;
        if (is_dir($path)) {
            $result[$file] = scanDirectory($path);
        } else if (in_array(strtolower(pathinfo($file, PATHINFO_EXTENSION)), ['mp3', 'flac', 'wav'])) {
            $result[] = [
                'name' => $file,
                'path' => str_replace('../', '', $path),
                'type' => pathinfo($file, PATHINFO_EXTENSION)
            ];
        }
    }
    return $result;
}

$dir = __DIR__ . '/../music';
$files = scanDirectory($dir);

if (isset($files['error'])) {
    http_response_code(500);
    echo json_encode($files);
    exit;
}

$sylwester_playlist = [];
foreach ($files as $key => $value) {
    if (is_array($value) && isset($value['type'])) {
        $sylwester_playlist[] = $value;
        unset($files[$key]);
    }
}

if (!empty($sylwester_playlist)) {
    $files = array_merge(['SYLWESTER' => $sylwester_playlist], $files);
}

echo json_encode($files);
?>