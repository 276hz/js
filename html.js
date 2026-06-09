(async () => {
  const res = await fetch(location.href, {
    credentials: "include",
    cache: "no-store"
  });

  const html = await res.text();

  const blob = new Blob([html], {
    type: "text/html;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "source.html";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);

  console.log("✅ Đã tạo file HTML bằng Blob:", html.length, "ký tự");
})();
